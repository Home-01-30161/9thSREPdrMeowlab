import { cached } from "../cache";
import { sanitizeUntrusted } from "../security";

/**
 * Unsung mode step 1: resolve the user's free-text region into a bounding box.
 *
 * The existing Open-Meteo geocoding (src/lib/connectors/geocode.ts) returns a
 * point, which is not enough — Overpass queries need an explicit bbox to stay
 * bounded. Nominatim (free, keyless) provides admin-area bounding boxes.
 *
 * Nominatim usage policy: max 1 request/second, must identify via User-Agent.
 * In practice the long TTL (below) keeps us far under the rate limit since
 * repeat requests for the same region all hit the cache.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Identify ourselves; anonymous/blank UAs get blocked by Nominatim.
const USER_AGENT = "unsungplanner/0.1 (local discovery feature)";

export interface RegionBbox {
    south: number;
    west: number;
    north: number;
    east: number;
    /** Sanitized display label (e.g. "Bayern" or "Chiang Mai"). */
    label: string;
}

/** Results wider than this (degrees) are treated as un-queryable, not clamped. */
const MAX_SPAN_DEG = 5;

const ALLOWED_CLASSES = new Set(["boundary", "place", "natural"]);

interface NominatimResult {
    boundingbox?: string[]; // [southLat, northLat, westLng, eastLng]
    display_name?: string;
    category?: string;
    type?: string;
}

/**
 * Resolves a region string into a bounded bbox. Returns null when nothing
 * credible is found or the match is too large for bounded Overpass queries
 * (caller surfaces an "region too large" message instead of a bad query).
 */
export async function resolveRegionBbox(region: string): Promise<RegionBbox | null> {
    const trimmed = region.trim().slice(0, 120);
    if (!trimmed) return null;

    const cacheKey = `unsung:region:v1:${trimmed.toLowerCase()}`;
    return cached<RegionBbox>(cacheKey, 7 * 86_400, async () => {
        const params = new URLSearchParams({
            q: trimmed,
            format: "jsonv2",
            limit: "8",
        });
        let results: NominatimResult[] | null = null;
        try {
            const res = await fetch(`${NOMINATIM}?${params}`, {
                signal: AbortSignal.timeout(8_000),
                headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            });
            if (res.ok) results = (await res.json()) as NominatimResult[];
        } catch {
            return null; // cached() handles null by not caching
        }

        if (!results?.length) return null;

        // Prefer administrative/placelike matches over street-level noise
        // (buildings, highways, POI nodes that share the name).
        const ranked = results
            .map((r, idx) => ({ r, idx, preferred: ALLOWED_CLASSES.has(r.category ?? "") ? 0 : 1 }))
            .sort((a, b) => a.preferred - b.preferred || a.idx - b.idx);

        for (const { r } of ranked) {
            const bb = r.boundingbox?.map(Number);
            if (!bb || bb.length !== 4 || bb.some((n) => !Number.isFinite(n))) continue;
            const [south, north, west, east] = bb;
            if (!(north > south) || !(east > west)) continue; // sanity, not clamping
            if (north - south > MAX_SPAN_DEG || east - west > MAX_SPAN_DEG) continue; // too large
            // For large provinces/states (> 1.0 deg), focus on the central 1.0 deg sub-box to keep Overpass queries fast and reliable
            const MAX_QUERY_SPAN = 1.0;
            const latMid = (south + north) / 2;
            const lngMid = (west + east) / 2;
            const southFinal = north - south > MAX_QUERY_SPAN ? latMid - MAX_QUERY_SPAN / 2 : south;
            const northFinal = north - south > MAX_QUERY_SPAN ? latMid + MAX_QUERY_SPAN / 2 : north;
            const westFinal = east - west > MAX_QUERY_SPAN ? lngMid - MAX_QUERY_SPAN / 2 : west;
            const eastFinal = east - west > MAX_QUERY_SPAN ? lngMid + MAX_QUERY_SPAN / 2 : east;

            return {
                south: southFinal,
                west: westFinal,
                north: northFinal,
                east: eastFinal,
                label: sanitizeUntrusted(r.display_name ?? trimmed, 120),
            };
        }
        return null;
    });
}
