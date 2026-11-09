import {
    MIN_QUALITY,
    MAX_RESULTS,
    PREFILTER_MAX_POPULARITY,
    VERIFY_POOL_SIZE,
    pickVerifyPool,
    scoreStage,
    shortlistEligible,
    type QualityScored,
} from "./score";
import { type CategoryId, type UnsungPlace } from "./profiles";
import { fetchCategoryCandidates, fetchFallbackCandidates } from "./overpass";
import { resolveRegionBbox, type RegionBbox } from "./region";
import { normalizeCategories } from "./tagMatrix";
import { fetchWikidataInfo, type WikidataInfo } from "./wikidata";

/**
 * Unsung mode orchestrator (design build order steps 1–4).
 *
 * Deterministic pipeline — no LLM in this path:
 *   region → bbox → per-category Overpass → bulk WDQS → stage-A scoring →
 *   prefilter → shortlist + verify pool. Stage B (pageviews re-rank) is the
 *   next slice; until it exists the returned list is explicitly provisional.
 *
 * Failure semantics: every upstream connector returns null instead of
 * throwing; missing data becomes a note in the response so the UI can show
 * a degraded state rather than an error page.
 */

export interface UnsungRequest {
    /** Free-text region (city, admin area). */
    region: string;
    /** Phase-1 categories; empty ⇒ all. */
    categories?: readonly string[];
    /** Language used for Wikidata descriptions (e.g. "th" for Thai regions). */
    lang?: string;
    /** Stable per-user salt so verify-pool sampling differs across users. */
    userSeed?: string;
    /** Step notification callback */
    onStep?: (step: string) => void;
}

export interface UnsungResult {
    label: string | null;
    stage: "provisional";
    results: QualityScored[];    // shortlist-like list; passed shortlistEligible
    verifyPool: QualityScored[]; // zero-confidence, quality-OK candidates sampled for verification
    notes: string[];             // degradation notes for the UI ("stale data" states)
}

export async function unsungShortlist(req: UnsungRequest): Promise<UnsungResult> {
    const notes: string[] = [];
    const empty = (label: string | null): UnsungResult => ({
        label,
        stage: "provisional",
        results: [],
        verifyPool: [],
        notes,
    });

    // ── Step 1: region → bbox ──────────────────────────────────────────────
    const bbox = await resolveRegionBbox(req.region);
    req.onStep?.("resolve_region");
    if (!bbox) return empty(null); // nothing credible, or region too large

    // ── Step 2: bounded Overpass fetch, one query per selected category ────
    const categories = normalizeCategories(req.categories);
    const perCategory = await Promise.all(
        categories.map((c) => fetchCategoryCandidates(c, bbox, bbox.label)),
    );
    perCategory.forEach((r, i) => {
        if (r === null) notes.push(`osm-fetch-failed:${categories[i]}`);
    });
    let places: UnsungPlace[] = perCategory.flatMap((r) => r ?? []);
    if (places.length === 0) {
        const fallbackResults = await Promise.all(
            categories.map((c) => fetchFallbackCandidates(c, bbox.label)),
        );
        places = fallbackResults.flat();
        if (places.length > 0) {
            // Fallback succeeded, clear raw osm fetch failure notes so UI doesn't report degraded
            notes.length = 0;
        }
    }
    req.onStep?.("fetch_candidates");
    if (places.length === 0) return empty(bbox.label);

    // ── Step 3: bulk Wikidata join (must complete BEFORE scoring) ─────────
    await enrichFromWikidata(places, req.lang ?? "en", notes);

    // ── Step 4: stage-A (provisional) scoring + prefilter ─────────────────
    const { categoryScores } = scoreStage(places, "A");
    const main: QualityScored[] = [];
    for (const byId of categoryScores.values()) {
        for (const scored of byId.values()) {
            if (scored.quality < MIN_QUALITY) continue; // obscure but useless
            if (
                scored.popularity !== null &&
                scored.popularity >= PREFILTER_MAX_POPULARITY
            ) continue; // measured as mainstream
            main.push(scored);
        }
    }
    main.sort((a, b) => b.score - a.score);
    req.onStep?.("score_gems");

    // Eligibility: zero-confidence places cannot shortlist on score alone.
    const results = main.filter((p) => shortlistEligible(p, false)).slice(0, MAX_RESULTS);
    const poolSource = main.filter((p) => !shortlistEligible(p, false));
    const verifyPool = pickVerifyPool(poolSource, verifySeed(req, bbox), VERIFY_POOL_SIZE);

    return { label: bbox.label, stage: "provisional", results, verifyPool, notes };
}

/** Records WD facts onto places; failed/missing lookups stay `undefined`. */
async function enrichFromWikidata(places: UnsungPlace[], lang: string, notes: string[]): Promise<void> {
    const qids = [...new Set(places.filter((p) => p.qid != null).map((p) => p.qid as string))];
    if (qids.length === 0) {
        return;
    }

    const info = await fetchWikidataInfo(qids, lang);
    if (!info) {
        // WDQS failed: every sitelinks stays undefined (unknown, not observed)
        // — obscurity is NOT measured this run. The scorer's unknown branch
        // and shortlistEligible handle it.
        notes.push("wdqs:failed");
        return;
    }

    const byQid = new Map<string, WikidataInfo>(info.map((w) => [w.qid, w]));
    for (const p of places) {
        const wd = p.qid != null ? byQid.get(p.qid) : undefined;
        if (!wd) continue; // no QID — OSM-native metadata only, also unknown
        p.sitelinks = wd.sitelinks; // queried-and-absent → observed 0
        p.hasWikipediaEntry = wd.sitelinks > 0 || undefined;
        p.hasDescription = wd.description != null || undefined;
        p.hasPhoto = wd.hasImage || undefined;
        // Wikidata P1435 is a real protection signal; OSM-only candidates have
        // to rely on the OSM heritage/listing keys (flagsFromOsmTags).
        p.protectionStatus = (p.protectionStatus === true || wd.hasHeritageDesignation) || undefined;
    }
}

function verifySeed(req: UnsungRequest, bbox: RegionBbox): string {
    return `${req.userSeed ?? "anon"}:${bbox.label}:${bbox.south.toFixed(3)},${bbox.west.toFixed(3)}`;
}
