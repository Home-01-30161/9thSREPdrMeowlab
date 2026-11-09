/** Debug: invoke the real plan-route POST for the unsung branch (NDJSON dump). */
import { POST } from "../src/app/api/plan/route";

async function main() {
    const body = {
        originCity: "Nürnberg",
        originCountry: "Germany",
        destCity: "Bamberg",
        destCountry: "Germany",
        startDate: "2026-12-05",
        nights: 3,
        travelers: 2,
        style: "Mid-range",
        mode: "train",
        displayCurrency: "USD",
        turnstileToken: "XXXX.DUMMY.TOKEN.XXXX", // Cloudflare's documented always-pass test token
        unsungMode: true,
    };
    const req = new Request("http://local/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const res = await POST(req);
    console.log("status:", res.status, "| content-type:", res.headers.get("content-type"));
    const text = await res.text();
    for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const evt = JSON.parse(line) as Record<string, unknown>;
        if (evt.type === "unsung") {
            console.log(`unsung event: label=${evt.label} results=${(evt.results as unknown[]).length} pool=${(evt.verifyPool as unknown[]).length} notes=${(evt.notes as string[]).join(",") || "(none)"}`);
            for (const h of (evt.results as Array<{ score: number; quality: number; confidence: number; popularity: number | null; sitelinks?: number; name: string; category: string }>)) {
                console.log(`  ${h.score.toFixed(2)} q=${h.quality} conf=${h.confidence} pop=${h.popularity === null ? "unknown" : h.popularity.toFixed(2)} sl=${h.sitelinks ?? "-"} ${h.name} [${h.category}]`);
            }
        } else if (evt.type === "error") {
            console.log("error event:", evt.message);
        } else {
            console.log("event:", evt.type, evt.node ?? "");
        }
    }
}

void main();
