/**
 * Server-only security helpers: client IP extraction, log scrubbing, URL
 * validation and optional Cloudflare Turnstile verification.
 *
 * Never import this from a client component — it reads server env vars.
 */

/**
 * Best-effort client IP, hardened against header spoofing.
 *
 * SECURITY: on Vercel the platform APPENDS the real connecting IP as the LAST
 * entry of `x-forwarded-for`; every earlier entry is client-supplied and
 * forgeable. Headers like `cf-connecting-ip` (Cloudflare-only — never set by
 * Vercel) and `x-real-ip` are also client-controlled on this host and were
 * removed after they let per-IP rate limits be bypassed by rotating them.
 */
export function clientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded?.trim()) {
        const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    return "unknown";
}

/** Removes API keys / bearer tokens from anything that is about to be logged. */
export function scrubSecrets(input: unknown): string {
    const text = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
    return text
        .replace(/(api_key|apikey|apiKey|token|key)=([^&\s"'`]+)/gi, "$1=***")
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
        .slice(0, 2_000);
}

/** True only for absolute https URLs — used before rendering untrusted research links. */
export function isHttpUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2_048) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Neutralizes prompt-injection vectors in untrusted text before it is placed
 * inside an LLM prompt: chat-template control tokens ([INST], [SYS], <<SYS>>),
 * angle brackets (which break out of <sources>/<research_notes> fences and are
 * never legitimate in place names, snippets, or URLs), and control characters
 * that some models treat as turn boundaries.
 *
 * There is no perfect defense against prompt injection — this raises the
 * attack floor. The primary defense is defense-in-depth: keep treating every
 * LLM response as data, validate structured output with zod, and never render
 * model text as HTML (no dangerouslySetInnerHTML).
 */
export function sanitizeUntrusted(text: string, maxLength = 4_000): string {
    return text
        // chat-template tokens used to fake system/user turns
        .replace(/\[\/?(?:INST|SYS|INSTRUCTION)\]|<<\/?SYS>>/gi, "")
        // angle brackets break out of the prompt's data fences
        .replace(/[<>]/g, " ")
        // control characters except \n \r \t, which preserve readability
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
        .slice(0, maxLength);
}

/**
 * Verifies a Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is configured.
 * Returns true unconditionally when the secret is absent, so local dev and
 * self-hosted setups keep working without captcha.
 *
 * The token is single-use; the client must obtain a fresh one for each attempt.
 * NOTE: never cache siteverify results — token single-use semantics are
 * enforced by Cloudflare server-side, and caching here would reintroduce
 * replay attacks (a cached "pass" would let one token authorize many requests).
 */
let turnstileWarned = false;

export async function verifyTurnstile(tokenValue: unknown, ip: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        // Misconfig guard: the widget site key IS present but the server secret
        // is missing. Captcha is silently off and every token (replayed or
        // forged) would pass. Say so loudly.
        if (!turnstileWarned && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
            turnstileWarned = true;
            console.warn(
                "CAPTCHA DISABLED: TURNSTILE_SECRET_KEY is not set while NEXT_PUBLIC_TURNSTILE_SITE_KEY is. " +
                "Set both variables in the Vercel environment and redeploy, or bot quota protection will not work."
            );
        }
        return true;
    }
    if (!turnstileWarned && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
        turnstileWarned = true;
        console.warn(
            "CLIENTS WILL BE REJECTED: TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not — " +
            "the browser cannot obtain a widget token, so every request fails verification."
        );
    }

    const token = typeof tokenValue === "string" ? tokenValue : "";
    if (!token || token.length > 4_096) return false;

    try {
        const params: Record<string, string> = { secret, response: token };
        if (ip && ip !== "unknown") {
            params.remoteip = ip;
        }
        const body = new URLSearchParams(params);
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body,
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { success?: boolean };
        return data.success === true;
    } catch {
        // Fail closed: if Cloudflare is unreachable we do not hand out free quota.
        return false;
    }
}
