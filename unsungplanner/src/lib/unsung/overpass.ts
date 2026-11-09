import { cached } from "../cache";
import { sanitizeUntrusted, scrubSecrets } from "../security";
import { flagsFromOsmTags, type CategoryId, type OsmTags, type UnsungPlace } from "./profiles";
import { tagSelectors } from "./tagMatrix";

/**
 * Unsung mode step 2: candidate places from Overpass.
 *
 * Runtime discipline (see design doc "Runtime constraints"):
 * - One bounded query PER SELECTED CATEGORY, not one combined query: the
 *   `out` limit applies to the whole statement, so a combined query would let
 *   high-volume tags (viewpoint) fill the cap and starve heritage.
 * - `[out:json][timeout:50]`, explicit bbox, `out center ... N` cap. The
 *   numeric limit keeps the payload predictable — JSON.parse of the response
 *   is exactly what burns Workers CPU.
 * - Relations are skipped in phase 1 (multipolygon geometry handling); node +
 *   way covers the candidate types in the tag matrix.
 */

const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
] as const;
const FETCH_TIMEOUT_MS = 15_000;
const SLOW_ATTEMPT_MS = 10_000;
const MAX_ELEMENTS = 400;

export interface OverpassElement {
    type?: string;
    id?: number;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: Record<string, string>;
}

export interface OverpassResponse {
    elements?: OverpassElement[];
}

export function buildQuery(
    category: CategoryId,
    b: { south: number; west: number; north: number; east: number },
): string {
    const bbox = `${b.south},${b.west},${b.north},${b.east}`;
    const selectors = tagSelectors(category);
    const statements = selectors.flatMap((sel) => [
        `    node${sel}(${bbox});`,
        `    way${sel}(${bbox});`,
    ]).join("\n");
    return (
        `[out:json][timeout:${Math.ceil(FETCH_TIMEOUT_MS / 1000)}];\n` +
        `(\n` +
        `${statements}\n` +
        `);\n` +
        `out center qt ${MAX_ELEMENTS};`
    );
}

/**
 * Pure element → candidate mapping and dedupe. Exported for tests.
 *
 * Dedupe rule: same Wikidata tag wins; otherwise same normalized name within
 * ~110 m rounded coords. Keeps node+way duplicates of one physical object
 * from counting as two peers.
 */
export function parseOverpass(
    response: OverpassResponse,
    category: CategoryId,
    regionLabel: string,
): UnsungPlace[] {
    const candidates = new Map<string, UnsungPlace>();
    for (const el of response.elements ?? []) {
        const tags = (el.tags ?? {}) as OsmTags;
        const name = tags.name?.trim();
        if (!name) continue; // unnamed → drop; the UI needs a name

        const lat = el.type === "node" ? el.lat : el.center?.lat;
        const lng = el.type === "node" ? el.lon : el.center?.lon;
        if (
            typeof lat !== "number" || typeof lng !== "number" ||
            !Number.isFinite(lat) || !Number.isFinite(lng)
        ) continue;
        if (typeof el.id !== "number" || !el.type) continue;

        const qid = tags.wikidata?.startsWith("Q") ? tags.wikidata : undefined;
        const place: UnsungPlace = {
            id: `osm:${el.type}/${el.id}`,
            name: sanitizeUntrusted(name, 200),
            category,
            region: regionLabel,
            lat,
            lng,
            qid,
            ...flagsFromOsmTags(tags, category),
        };

        const dedupeKey = qid ?? `${round3(lat)},${round3(lng)}:${name.toLowerCase()}`;
        const existing = candidates.get(dedupeKey);
        if (existing === undefined) {
            candidates.set(dedupeKey, place);
        } else if (relevance(place) > relevance(existing)) {
            candidates.set(dedupeKey, place); // prefer the element with more metadata (usually the way)
        }
    }
    return [...candidates.values()];
}

/**
 * Fast discovery fallback using SerpAPI Google Local when public Overpass servers are down or degraded.
 */
export async function fetchFallbackCandidates(
    category: CategoryId,
    regionLabel: string,
): Promise<UnsungPlace[]> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return [];

    const query = category === "heritage"
        ? `castles ruins monasteries historic sites in ${regionLabel}`
        : `nature preserves waterfalls lakes trails in ${regionLabel}`;

    const cacheKey = `unsung:fallback:v1:${category}:${regionLabel.toLowerCase()}`;
    const result = await cached<UnsungPlace[]>(cacheKey, 7 * 86_400, async () => {
        try {
            const url = `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
            if (!res.ok) return [];
            const data = await res.json();
            const places: UnsungPlace[] = (data.local_results || []).slice(0, 10).map((r: any, idx: number) => ({
                id: `local:${category}:${idx}:${sanitizeUntrusted(r.title || "spot", 40).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                name: sanitizeUntrusted(r.title || "Unnamed Spot", 200),
                category,
                region: regionLabel,
                lat: r.gps_coordinates?.latitude || 0,
                lng: r.gps_coordinates?.longitude || 0,
                reviewCount: typeof r.reviews === "number" ? r.reviews : undefined,
                protectionStatus: true,
                hasWebsite: Boolean(r.links?.website),
                hasOpeningHours: Boolean(r.hours || r.operating_hours),
                hasDescription: Boolean(r.description),
                hasPhoto: Boolean(r.thumbnail),
                hasWikipediaEntry: false,
            }));
            return places.filter((p) => p.lat !== 0 && p.lng !== 0);
        } catch {
            return [];
        }
    });
    return result ?? [];
}

/**
 * Cached production fetch for one category. Returns null on any failure
 * (network, timeout, rate-limit bounce, region too small) — never throws:
 * unsung mode must degrade, not crash the plan graph.
 */
export async function fetchCategoryCandidates(
    category: CategoryId,
    bbox: { south: number; west: number; north: number; east: number },
    regionLabel: string,
): Promise<UnsungPlace[] | null> {
    const key =
        `unsung:osm:v1:${category}:` +
        `${bbox.south.toFixed(4)},${bbox.west.toFixed(4)},` +
        `${bbox.north.toFixed(4)},${bbox.east.toFixed(4)}`;
    // 3 days: OSM data changes slowly; keeps the public Overpass instance happy.
    return cached<UnsungPlace[]>(key, 3 * 86_400, async () => {
        const res = await runOverpass(buildQuery(category, bbox));
        return res ? parseOverpass(res, category, regionLabel) : null;
    });
}

function relevance(p: UnsungPlace): number {
    return (p.qid ? 10 : 0) + Object.keys(p).length;
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** Production fetch: ≤2 subrequests (mirror retry), hard timeout, null on failure. */
export async function runOverpass(query: string): Promise<OverpassResponse | null> {
    const t0 = Date.now();
    for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
        try {
            const res = await fetch(OVERPASS_ENDPOINTS[i], {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    // Overpass rejects anonymous scripted requests with 406 —
                    // an identifying UA + Accept header is required (verified live).
                    "User-Agent": "unsungplanner/0.1 (local discovery feature)",
                    Accept: "application/json, */*",
                },
                body: new URLSearchParams({ data: query }).toString(),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (res.ok) return (await res.json()) as OverpassResponse;
            console.warn(`overpass endpoint ${i}: non-OK status ${res.status}`);
        } catch (e) {
            console.warn(`overpass endpoint ${i} failed:`, scrubSecrets(e));
        }
        // Retry the mirror only after a FAST failure (rate-limit / 5xx): a
        // full FETCH_TIMEOUT_MS was already spent, and the route handler's
        // maxDuration budget (60s) cannot absorb a second slow attempt.
        if (Date.now() - t0 > SLOW_ATTEMPT_MS) {
            console.warn("overpass: first attempt was slow — skipping mirror retry");
            break;
        }
    }
    return null; // includes timeouts and Overpass 429/504s
}
