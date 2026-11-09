import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ─── Typhoon (OpenTyphoon.ai) proxy ──────────────────────────────────────────
// This endpoint previously talked to an OpenClaw agent gateway over WebSocket.
// It now calls the Typhoon API directly (OpenAI-compatible chat completions).
// The Typhoon API key stays entirely server-side — the browser only ever sees
// this proxy, never the key or the upstream requests.
const TYPHOON_BASE_URL = process.env.TYPHOON_BASE_URL || 'https://api.opentyphoon.ai/v1';
const TYPHOON_MODEL = process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct';
const TYPHOON_OCR_MODEL = process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr';
const RESPONSE_TIMEOUT_MS = 90_000;
const MAX_MESSAGE_LENGTH = 16_000;
const MAX_IMAGE_LENGTH = 12_000_000; // data URL characters (~9 MB binary)
const MAX_SESSION_LENGTH = 64;

// Tight allowlist: the app only uses the two shop agent sessions and the
// dynamically-created Level 1 OCR sessions.
const SESSION_KEY_RE = /^(agent:[\w-]+:[\w-]+|report-ocr-\d{1,16})$/;

// Default persona for messages the client sends without an embedded system
// prompt (e.g. the generic chat UI path).
const DEFAULT_SYSTEM_PROMPT =
  'You are HOMY Agent, a friendly customer service assistant for HOMY SHOP — a premium shoe store. ' +
  'Help customers with product questions, sizing, order tracking, and store policies. Respond warmly in Thai.';

// The Typhoon OCR model only behaves correctly with its canonical prompt, so
// OCR requests always use this fixed instruction (the client message text is
// NOT forwarded in OCR mode).
const OCR_PROMPT = `Extract all text from the image.

Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.
- If there is no text in the image, answer exactly: ไม่พบข้อความ
- Translate to Thai any text in another language verbatim (do not summarise or add opinions).`;

// Fixed, non-leaking error strings returned to the client.
const ERR_CONFIG = 'Agent is not configured on this server';
const ERR_UNREACHABLE = 'ไม่สามารถเชื่อมต่อ Typhoon AI';

// ─── Chat-completions helper ─────────────────────────────────────────────────
type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type MessageContent = string | (TextPart | ImagePart)[];
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: MessageContent; }

interface TyphoonOpts {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  user?: string;
}

async function callTyphoon(
  apiKey: string,
  messages: ChatMessage[],
  opts: TyphoonOpts = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT_MS);
  try {
    const res = await fetch(`${TYPHOON_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model ?? TYPHOON_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.6,
        repetition_penalty: 1.05,
        stream: false,
        ...(opts.user ? { user: opts.user } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[agent-chat] Typhoon API ${res.status}: ${detail.slice(0, 400)}`);
      throw new Error(`Typhoon API error ${res.status}`);
    }

    const json: { choices?: { message?: { content?: string } }[] } = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ─── OCR output cleanup ──────────────────────────────────────────────────────
// Some Typhoon OCR generations wrap their result as JSON, markdown fences or
// an HTML document — normalise everything back to plain markdown text.
function cleanOcrOutput(raw: string): string {
  const content = raw.trim();
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { natural_text?: unknown }).natural_text === 'string') {
      return ((parsed as { natural_text: string }).natural_text).trim();
    }
  } catch { /* plain text — fine */ }

  const fenced = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(content);
  return (fenced ? fenced[1] : content).trim();
}

// ─── System-prompt extraction ────────────────────────────────────────────────
// The client composes "System:\n<prompt>\n\nUser:...\n<rest>" into a single
// string (an OpenClaw habit). Lift the leading System block into a proper
// system message and keep the remainder as the user turn.
function splitSystemMessage(message: string): { system?: string; user: string } {
  const m = /^System:\n([\s\S]*?)\n\n(?:User:\n)?([\s\S]*)$/.exec(message);
  if (m) return { system: m[1].trim() || undefined, user: m[2] };
  return { user: message };
}

export async function POST(req: NextRequest) {
  let body: { sessionKey?: unknown; message?: unknown; image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionKey, message, image } = body;
  if (typeof sessionKey !== 'string' || sessionKey.length > MAX_SESSION_LENGTH || !SESSION_KEY_RE.test(sessionKey)) {
    return NextResponse.json({ ok: false, error: 'Invalid sessionKey' }, { status: 400 });
  }
  if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ ok: false, error: 'Invalid message' }, { status: 400 });
  }
  const validImage =
    typeof image === 'string' && image.startsWith('data:image/')
      ? image
      : undefined;
  if (validImage && validImage.length > MAX_IMAGE_LENGTH) {
    return NextResponse.json({ ok: false, error: 'Image too large' }, { status: 400 });
  }

  // Server-only env. Typhoon keys are issued from playground.opentyphoon.ai.
  const apiKey = process.env.TYPHOON_API_KEY || '';
  if (!apiKey) {
    console.error('[agent-chat] no TYPHOON_API_KEY configured on the server');
    return NextResponse.json({ ok: false, error: ERR_CONFIG }, { status: 500 });
  }

  try {
    let text: string;
    if (validImage) {
      // OCR mode: keep the canonical prompt, attach the image, read back text.
      text = cleanOcrOutput(
        await callTyphoon(apiKey, [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: validImage } },
          ],
        }], { model: TYPHOON_OCR_MODEL, maxTokens: 8192, temperature: 0, user: sessionKey }),
      );
    } else {
      const parts = splitSystemMessage(message);
      text = (
        await callTyphoon(apiKey, [
          { role: 'system', content: parts.system || DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: parts.user },
        ], { user: sessionKey })
      ).trim();
    }

    if (!text) {
      console.error('[agent-chat] Typhoon returned an empty completion');
      return NextResponse.json({ ok: false, error: ERR_UNREACHABLE }, { status: 502 });
    }
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    console.error('[agent-chat] request failed:', err);
    return NextResponse.json({ ok: false, error: ERR_UNREACHABLE }, { status: 502 });
  }
}
