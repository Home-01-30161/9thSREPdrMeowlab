import { cached } from "../cache";

/**
 * Unsung mode step 3: bulk Wikidata Query Service join.
 *
 * One SPARQL call per ~500 QIDs fetches everything the scoring needs:
 * sitelink counts, descriptions, coords, images. This is the design's answer
 * to the Workers subrequest limit — per-place REST chaining would die at 50
 * subrequests/invocation, while a region's candidates are covered in 1–2 calls.
 *
 * "Queried and absent" semantics: when this call SUCCEEDS, every requested QID
 * that comes back missing is recorded with `sitelinks: 0` (an observation —
 * the lookup happened and found nothing). When the call FAILS, the recorder
 * maps to `undefined` (unknown), which the scorer treats differently. That
 * distinction is the heart of the design's missing-data handling.
 */

const WDQS = "https://query.wikidata.org/sparql";
const FETCH_TIMEOUT_MS = 20_000;
const QIDS_PER_QUERY = 500; // VALUES clause size
const MAX_CHUNKS = 8;       // request ceiling: ≤ 4,000 QIDs per region request

// Identify ourselves; WDQS policy expects a descriptive UA.
const USER_AGENT = "unsungplanner/0.1 (local discovery feature)";

export interface WikidataInfo {
    qid: string;
    sitelinks: number;
    /** EN description when available (confidence signal, never a quality bonus). */
    description?: string;
    hasImage: boolean;
    /** Heritage designation (P1435) presence — an intrinsic protection signal. */
    hasHeritageDesignation: boolean;
}

interface Binding {
    item?: { value?: string };
    sitelinks?: { value?: string | number };
    description?: { type?: string; value?: string };
    descriptionEn?: { type?: string; value?: string };
    image?: { type?: string; value?: string };
    heritage?: { type?: string; value?: string };
}

interface SparqlResponse {
    results?: { bindings?: Binding[] };
}

/**
 * Fetches WD info for a batch of QIDs. Returns null on failure — the caller
 * must then treat ALL requested qids as unknown (`undefined`), never as
 * observed-zero. That boundary is what keeps "obscurity measured by the bulk
 * query" from degrading into "absence of a successful query pretends to be
 * obscurity".
 */
export async function fetchWikidataInfo(
    qids: readonly string[],
    lang: string,
): Promise<readonly WikidataInfo[] | null> {
    // Stable unique list, capped.
    const unique = [...new Set(qids)].slice(0, QIDS_PER_QUERY * MAX_CHUNKS);
    if (unique.length === 0) return [];

    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += QIDS_PER_QUERY) {
        chunks.push(unique.slice(i, i + QIDS_PER_QUERY) as string[]);
    }

    const cacheKey = `unsung:wdqs:v1:${fnv1a(unique.join(",")).toString(16)}:${lang}`;
    const cachedChunks = await cached<WikidataInfo[]>(cacheKey, 3 * 86_400, async () => {
        const results: WikidataInfo[] = [];
        for (const chunk of chunks) {
            // Chunk failures fail the whole call — keep the observed/unknown
            // boundary clean rather than mixing verified and unverified data.
            // 3-day TTL makes retries rare and cheap.
            const parsed = await queryChunk(chunk, lang);
            if (parsed === null) return null;
            results.push(...parsed);
        }
        return results;
    });
    return cachedChunks;
}

async function queryChunk(qids: readonly string[], lang: string): Promise<WikidataInfo[] | null> {
    try {
        const res = await fetch(WDQS, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/sparql-results+json",
                "User-Agent": USER_AGENT,
            },
            body: new URLSearchParams({
                query: buildQuery(qids, lang),
                format: "json",
            }).toString(),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const text = await res.text();
        return parseResponse(text, qids);
    } catch {
        return null;
    }
}

export function buildQuery(qids: readonly string[], lang: string): string {
    const values = qids.map((q) => `wd:${q}`).join(" ");
    return `SELECT ?item ?sitelinks ?description ?descriptionEn ?image ?heritage WHERE {
  VALUES ?item { ${values} }
  ?item wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "${lang}") }
  OPTIONAL { ?item schema:description ?descriptionEn. FILTER(LANG(?descriptionEn) = "en") }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P1435 ?heritage. }
}`;
}

export function parseResponse(raw: string, requestedQids: readonly string[]): WikidataInfo[] | null {
    let data: SparqlResponse;
    try {
        data = JSON.parse(raw) as SparqlResponse;
    } catch {
        return null;
    }
    const bindings = data.results?.bindings;
    if (!bindings) return null;

    const out: WikidataInfo[] = [];
    for (const b of bindings) {
        const entityUri = b.item?.value ?? "";
        const qid = entityUri.split("/").pop() ?? "";
        const sitelinks = Number(b.sitelinks?.value);
        if (!qid.startsWith("Q") || !Number.isFinite(sitelinks)) continue;
        const description = (b.description?.value ?? b.descriptionEn?.value) || undefined;
        out.push({
            qid,
            sitelinks: Math.max(0, Math.floor(sitelinks)),
            description: typeof description === "string" ? description : undefined,
            hasImage: Boolean(b.image?.value),
            hasHeritageDesignation: Boolean(b.heritage?.value),
        });
    }

    // Queried-and-absent: any requested QID not returned by WDQS is an
    // observation of nonexistence/absence (legitimate QIDs from OSM tags can
    // resolve to deleted entities), recorded as sitelinks 0.
    const returned = new Set(out.map((w) => w.qid));
    for (const qid of requestedQids) {
        if (!returned.has(qid)) out.push({ qid, sitelinks: 0, hasImage: false, hasHeritageDesignation: false });
    }
    return out;
}

/** Small, stable 32-bit hash for cache keys. */
function fnv1a(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
