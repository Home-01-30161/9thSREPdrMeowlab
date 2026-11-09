import type { CategoryId, QualityProfile, UnsungPlace } from "./profiles";
import { profile } from "./profiles";

/**
 * Unsung mode scoring — PURE module, no fetches, deterministic. Tests live in
 * score.test.ts and must cover:
 *   - all-zeros tie block
 *   - ties among nonzero values (mid-rank)
 *   - fewer than MIN_PEERS peers
 *   - zero-fraction above the guard threshold
 *   - observed-absent vs. missing (`0` vs `undefined`) everywhere
 *   - the two popularity stages and the unknown-popularity fallback
 *
 * Design contract (unsung-mode-design.md):
 *   "Queried and absent" counts as an observation. Zeros rank BOTTOM (not
 *   mid-population — `v <= value` counting made a zero-view place look 80%
 *   popular among 80% zeros). Genuine no-data stays `undefined` and scales
 *   the score by confidence. Popularity builds in two stages because only
 *   sitelinks exist before the pageviews pass. Eligibility rules — not the
 *   score — protect against "absence ≠ worth".
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const STAGE_A_MIN_OBSERVED = 1; // sitelinks only (0 counts — it was queried)
export const STAGE_B_MIN_OBSERVED = 2; // sitelinks + pageviews
export const MIN_PEERS = 10;           // minimum peers with data for a usable percentile
export const ZERO_SIGNAL_FRACTION = 0.7; // ≥ this share of zeros → signal can't discriminate
export const POPULARITY_UNKNOWN_WEIGHT = 0.6;
export const POPULARITY_INVERSE_FLOOR = 0.15;
export const UNKNOWN_CONFIDENCE_FLOOR = 0.25;

// Prefilter config (stage A). The UI slider maps onto MAX_POPULARITY.
export const PREFILTER_MAX_POPULARITY = 0.7;
export const MIN_QUALITY = 0.2;
export const MAX_RESULTS = 30;      // shortlist size cap returned to the caller
export const VERIFY_POOL_SIZE = 5;  // sampled per request, see pickVerifyPool

export type PopularityStage = "A" | "B";
export type Ranker = (value: number) => number; // 0..1 percentile

export interface PeerRankers {
    sitelinks: Ranker | null;
    pageviews: Ranker | null;
    reviewCount: Ranker | null;
}

export interface QualityScored extends UnsungPlace {
    quality: number;
    confidence: number;
    popularity: number | null;
    score: number;
}

/** Popularity signals carried by a place (subset used by rankers). */
export type PopularityCarrier = {
    sitelinks?: number;
    pageviews?: number;
    reviewCount?: number;
};

// ─── Percentile machinery ────────────────────────────────────────────────────

/** First index where value could be inserted keeping order (strictly below count). */
function bisectLeft(sorted: readonly number[], value: number): number {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] < value) lo = mid + 1; else hi = mid;
    }
    return lo;
}

/** Count of values strictly greater than `value` (for mid-rank tie handling). */
function bisectRight(sorted: readonly number[], value: number): number {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] <= value) lo = mid + 1; else hi = mid;
    }
    return lo;
}

/**
 * Mid-rank percentile of `value` (which must be > 0) within presorted nonzero
 * `values`. Ties split half a rank each, so a pile of equal values straddles
 * the boundary instead of all landing on top of it.
 */
export function percentageRank(sorted: readonly number[], value: number): number {
    const below = bisectLeft(sorted, value);
    const ties = bisectRight(sorted, value) - below;
    return (below + ties / 2) / sorted.length;
}

/**
 * Builds a ranker for one popularity signal over candidate peers.
 *
 * `values` contains the signal per peer; undefined = no data (not queried),
 * 0 = queried and absent (an observation). Zeros are excluded from the ranked
 * distribution and pinned at percentile 0 — a zero-sitelink place among 80%
 * zeros is maximally obscure BY observation, not 80% popular. When the zero
 * share exceeds `zeroFractionLimit` the ranker declines entirely: the signal
 * can no longer tell candidates apart, and a declined ranker contributes
 * nothing rather than lying.
 */
export function buildSignalRanker(
    values: readonly (number | undefined)[],
    minPeers: number = MIN_PEERS,
    zeroFractionLimit: number = ZERO_SIGNAL_FRACTION,
): Ranker | null {
    const observed = values.filter((v): v is number => v != null);
    const nonzero = [...observed.filter((v) => v > 0)].sort((a, b) => a - b);
    if (nonzero.length < minPeers) return null; // too few data points
    if (1 - nonzero.length / observed.length >= zeroFractionLimit) return null; // mostly zeros
    return (value: number) => (value <= 0 ? 0 : percentageRank(nonzero, value));
}

type SignalFields = keyof PopularityCarrier;

function signalValues(places: readonly UnsungPlace[], field: SignalFields): (number | undefined)[] {
    return places.map((p) => p[field]);
}

/**
 * Tiered peer resolution: narrowest scope first, widen while the tier is too
 * small. Tier 1 = same category, same region; tier 2 = all categories in the
 * region (related-category fallback). If no tier has MIN_PEERS peers, rankers
 * are all null and popularity is genuinely unknown.
 */
export function peerRankersFor(tiers: readonly (readonly UnsungPlace[])[]): PeerRankers {
    const fields: SignalFields[] = ["sitelinks", "pageviews", "reviewCount"];
    for (const tierPeers of tiers) {
        if (tierPeers.length < MIN_PEERS) continue; // widen scope
        const rankers: Partial<PeerRankers> = {};
        for (const f of fields) {
            rankers[f] = buildSignalRanker(signalValues(tierPeers, f));
        }
        return {
            sitelinks: rankers.sitelinks ?? null,
            pageviews: rankers.pageviews ?? null,
            reviewCount: rankers.reviewCount ?? null,
        };
    }
    return { sitelinks: null, pageviews: null, reviewCount: null };
}

// ─── The three factors ───────────────────────────────────────────────────────

/** Category-specific quality from the profile weight table. Documentation is never a quality flag. */
export function quality(p: UnsungPlace, prof: QualityProfile): number {
    let q = 0;
    for (const { flag, weight } of prof.weights) {
        if ((p as unknown as Record<string, unknown>)[flag]) q += weight;
    }
    return q;
}

/** Confidence: share of observed documentation signals (untrusted-free — a flag, not worth). */
export function confidence(p: UnsungPlace): number {
    const parts = [p.hasWikipediaEntry, p.hasDescription, p.hasPhoto];
    return parts.filter((v) => v === true).length / parts.length;
}

/**
 * Popularity 0..1, or null when too few observed signals to trust.
 *
 * Stage A passes STAGE_A_MIN_OBSERVED (sitelinks alone suffices — the bulk
 * WDQS call observes each candidate: 0 = absent). Stage B passes
 * STAGE_B_MIN_OBSERVED. Missing signals contribute nothing — they are never
 * averaged in as zeros, which would make undocumented places anonymous
 * instead of obscure.
 */
export function popularity(p: UnsungPlace, rankers: PeerRankers, minObserved: number): number | null {
    const parts: number[] = [];
    if (p.sitelinks !== undefined && rankers.sitelinks) parts.push(rankers.sitelinks(p.sitelinks));
    if (p.pageviews !== undefined && rankers.pageviews) parts.push(rankers.pageviews(p.pageviews));
    if (p.reviewCount !== undefined && rankers.reviewCount) parts.push(rankers.reviewCount(p.reviewCount));
    if (parts.length < minObserved) return null;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Composite unsung score. Unknown popularity is scaled by confidence with a
 * small floor, so a genuinely unmeasurable place never reaches the full
 * inverse multiplier — obscurity must be measured, not assumed.
 */
export function unsungScore(
    p: UnsungPlace,
    rankers: PeerRankers,
    prof: QualityProfile,
    minObserved: number,
): { score: number; quality: number; confidence: number; popularity: number | null } {
    const q = quality(p, prof);
    const conf = confidence(p);
    const pop = popularity(p, rankers, minObserved);
    const inverse =
        pop === null
            ? POPULARITY_UNKNOWN_WEIGHT *
              (UNKNOWN_CONFIDENCE_FLOOR + (1 - UNKNOWN_CONFIDENCE_FLOOR) * conf)
            : Math.max(1 - pop, POPULARITY_INVERSE_FLOOR);
    return { score: q * inverse, quality: q, confidence: conf, popularity: pop };
}

/** Zero-confidence places must be verified before they can reach the shortlist. */
export function shortlistEligible(p: UnsungPlace, verified: boolean): boolean {
    return verified || confidence(p) > 0;
}

// ─── Stage drivers ───────────────────────────────────────────────────────────

/**
 * Scores one stage for a region's candidate set. Peer tiers per category:
 *   tier 1 = same category, tier 2 = all candidates (related-category
 *   fallback). Stage "A" uses sitelinks only; stage "B" requires pageviews
 *   too and is called after the pageviews pass for top-K survivors.
 */
export function scoreStage(places: readonly UnsungPlace[], stage: PopularityStage): {
    categoryScores: Map<CategoryId, Map<string, QualityScored>>; // per category → per place id
} {
    const minObserved = stage === "A" ? STAGE_A_MIN_OBSERVED : STAGE_B_MIN_OBSERVED;
    const allIds = [...places];
    const out = new Map<CategoryId, Map<string, QualityScored>>();
    for (const cat of new Set(places.map((p) => p.category))) {
        const sameCat = allIds.filter((p) => p.category === cat);
        const tiers: readonly (readonly UnsungPlace[])[] = [sameCat, allIds];
        const rankers = peerRankersFor(tiers);
        const forCat = new Map<string, QualityScored>();
        for (const p of sameCat) {
            const r = unsungScore(p, rankers, profile(cat), minObserved);
            forCat.set(p.id, { ...p, ...r } satisfies QualityScored);
        }
        out.set(cat, forCat);
    }
    return { categoryScores: out };
}

// ─── Verify pool (seeded sampling) ───────────────────────────────────────────

const FNV1A_OFFSET = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

export function fnv1a(s: string): number {
    let h = FNV1A_OFFSET;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, FNV1A_PRIME);
    }
    return h >>> 0;
}

/**
 * Deterministic per-(user, region) sampling for the verify pool. Same seed →
 * same picks (stable cards across reloads); different seed → different picks,
 * so identical requests stop producing identical suggestions.
 */
export function pickVerifyPool<T>(candidates: readonly T[], seed: string, n: number): T[] {
    if (candidates.length <= n) return [...candidates];
    let r = fnv1a(seed) || 1;
    const next = () => {
        r = (Math.imul(r, 48271) + 11) >>> 0; // LCG
        return r / 0xffffffff;
    };
    const arr = [...candidates];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
}
