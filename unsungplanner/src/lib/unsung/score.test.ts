import assert from "node:assert/strict";
import {
    MIN_PEERS,
    POPULARITY_INVERSE_FLOOR,
    POPULARITY_UNKNOWN_WEIGHT,
    STAGE_A_MIN_OBSERVED,
    STAGE_B_MIN_OBSERVED,
    UNKNOWN_CONFIDENCE_FLOOR,
    buildSignalRanker,
    confidence,
    popularity,
    peerRankersFor,
    pickVerifyPool,
    shortlistEligible,
    unsungScore,
} from "./score";
import { profile, flagsFromOsmTags, type UnsungPlace } from "./profiles";

/**
 * Pure-function test harness for unsung scoring (design build order step 4).
 * Run: npm run test:unsung  (tsx src/lib/unsung/score.test.ts)
 *
 * Covers the mandated percentile edge cases:
 *   all-zeros tie block · mid-rank ties among nonzero values ·
 *   fewer than MIN_PEERS · zero-fraction guard ·
 *   observed-absent vs. missing (`0` vs `undefined`) · both stages ·
 *   OSM/Wikidata flag extraction (the `heritage` vs `historic` key trap).
 */

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (e) {
        failed++;
        console.error(`  FAIL  ${name}`);
        console.error(e);
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

let seq = 0;
function place(over: Partial<UnsungPlace>): UnsungPlace {
    seq += 1;
    return {
        id: `test:p/${seq}`,
        name: `P${seq}`,
        category: "heritage",
        region: "Test",
        lat: 0,
        lng: 0,
        ...over,
    };
}

function nPlaces(n: number, over: Partial<UnsungPlace>): UnsungPlace[] {
    return Array.from({ length: n }, () => place(over));
}

function nValues(n: number, v: number | undefined): (number | undefined)[] {
    return Array.from({ length: n }, () => v);
}

function emptyRankers() {
    return { sitelinks: null, pageviews: null, reviewCount: null };
}

function assertRanker(ranker: (v: number) => number, value: number, expected: number, note = ""): void {
    const got = ranker(value);
    assert.ok(
        Math.abs(got - expected) < 1e-9,
        `rank(${value}) = ${got}, expected ${expected}${note ? ` — ${note}` : ""}`,
    );
}

function close(a: number, b: number, eps = 1e-9): boolean {
    return Math.abs(a - b) < eps;
}

// ─── percentile edge cases (mandated by build order step 4) ─────────────────

test("mid-rank ties: equal nonzero values straddle the boundary", () => {
    const ranker = buildSignalRanker([1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(ranker, "11 peers, no zeros → ranker must exist");
    assertRanker(ranker!, 2, 2 / 11, "below=1, ties=2 → (1+2/2)/11 = 2/11");
    assertRanker(ranker!, 7, 7.5 / 11, "below=7 (1,2,2,3,4,5,6), ties=1 → 7.5/11");
});

test("all-zeros tie block: zero ranks BOTTOM, not mid-population", () => {
    // 5 zeros + 14 nonzero: zero share ~26% (< 70% guard) → ranker usable
    const ranker = buildSignalRanker([0, 0, 0, 0, 0, ...nValues(14, 1)]);
    assert.ok(ranker, "enough nonzero peers → ranker must exist");
    assertRanker(ranker!, 0, 0, "observed absence is maximally obscure, not popular");
});

test("zero-fraction guard: an 80%-zero signal declines to rank", () => {
    const values = [...nValues(10, 1), ...nValues(40, 0)]; // 80% zeros
    assert.equal(
        buildSignalRanker(values),
        null,
        "≥ 70% zeros → signal cannot discriminate; must decline, not lie",
    );
});

test("zero-fraction guard boundary: 70% declined, 69% usable", () => {
    const seventy = [...nValues(30, 1), ...nValues(70, 0)];
    assert.equal(buildSignalRanker(seventy), null);
    const sixtynine = [...nValues(31, 1), ...nValues(69, 0)];
    assert.ok(buildSignalRanker(sixtynine) !== null);
});

test("fewer than MIN_PEERS peers: ranker declines", () => {
    assert.equal(buildSignalRanker(nValues(MIN_PEERS - 1, 1)), null);
});

test("exactly MIN_PEERS peers returns a usable ranker", () => {
    assert.ok(buildSignalRanker(nValues(MIN_PEERS, 1)) !== null);
});

test("missing data (undefined) never inflates observed counts", () => {
    const values: (number | undefined)[] = [3, 5, ...nValues(10, undefined)];
    assert.equal(buildSignalRanker(values), null, "only 2 observed < MIN_PEERS");
});

test("monotonicity: a bigger value never ranks lower", () => {
    const ranker = buildSignalRanker([1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10])!;
    assert.ok(ranker(1) <= ranker(2) && ranker(2) <= ranker(3) && ranker(5) <= ranker(6));
});

// ─── observed-absent vs missing ──────────────────────────────────────────────

test("stage A: observed zero sitelinks yields popularity 0, not null", () => {
    const ranker = buildSignalRanker(nValues(MIN_PEERS, 5))!;
    const p = place({ sitelinks: 0 }); // queried and absent
    const got = popularity(p, { sitelinks: ranker, pageviews: null, reviewCount: null }, STAGE_A_MIN_OBSERVED);
    assert.equal(got, 0, "measured obscurity");
    const never = place({}); // never queried — genuinely missing
    assert.equal(
        popularity(never, { sitelinks: ranker, pageviews: null, reviewCount: null }, STAGE_A_MIN_OBSERVED),
        null,
    );
});

test("stage B requires two observed signals; one-signal falls to unknown", () => {
    const ranker = buildSignalRanker(nValues(MIN_PEERS, 5))!;
    const p = place({ sitelinks: 0 });
    assert.equal(popularity(p, { sitelinks: ranker, pageviews: null, reviewCount: null }, STAGE_B_MIN_OBSERVED), null);
    const hadViews = place({ sitelinks: 0, pageviews: 100 });
    // pageviews ranker absent → only sitelinks observed → still null at stage B
    assert.equal(popularity(hadViews, { sitelinks: ranker, pageviews: null, reviewCount: null }, STAGE_B_MIN_OBSERVED), null);
});

// ─── unknown-popularity branch ───────────────────────────────────────────────

test("unknown popularity scales by confidence, never reaching the full multiplier", () => {
    const prof = profile("heritage");
    const bare = place({ protectionStatus: true }); // conf 0
    const documented = place({
        protectionStatus: true,
        hasWikipediaEntry: true,
        hasDescription: true,
        hasPhoto: true,
    }); // conf 1
    const sBare = unsungScore(bare, emptyRankers(), prof, STAGE_A_MIN_OBSERVED);
    const sDoc = unsungScore(documented, emptyRankers(), prof, STAGE_A_MIN_OBSERVED);

    // q = 0.5 for both; unknown branch: UNKNOWN_WEIGHT * (FLOOR + (1-FLOOR)*conf)
    okClose(0.5 * POPULARITY_UNKNOWN_WEIGHT * UNKNOWN_CONFIDENCE_FLOOR, sBare.score);
    okClose(0.5 * POPULARITY_UNKNOWN_WEIGHT * 1, sDoc.score);
    assert.ok(sDoc.score > sBare.score, "more documentation → more confidence → higher score");
    assert.ok(sDoc.score < POPULARITY_UNKNOWN_WEIGHT + 1e-9, "never reaches the full inverse");
});

// ─── known-popularity branch: floor at the top end ─────────────────────────

test("all-equal peers pin at mid-rank (0.5), both directions", () => {
    const ranker = buildSignalRanker(nValues(MIN_PEERS, 1))!; // all peers equal
    assertRanker(ranker, 1, 0.5);
    const r = unsungScore(place({ sitelinks: 1 }), { sitelinks: ranker, pageviews: null, reviewCount: null }, profile("heritage"), STAGE_A_MIN_OBSERVED);
    okClose(0.5, r.popularity as number);
});

test("unique top value: pop 0.95 → inverse floored at INVERSE_FLOOR", () => {
    const ranker = buildSignalRanker([...nValues(MIN_PEERS - 1, 1), 100])!;
    const r = unsungScore(
        place({ sitelinks: 100, protectionStatus: true }),
        { sitelinks: ranker, pageviews: null, reviewCount: null },
        profile("heritage"),
        STAGE_A_MIN_OBSERVED,
    );
    okClose(0.95, r.popularity as number, "(below=9, ties=1 → 9.5/10)");
    // 1 − 0.95 = 0.05 < FLOOR → the floor must hold the multiplier up
    okClose(0.5 * POPULARITY_INVERSE_FLOOR, r.score);
});

test("zero-sitelink candidate in a healthy signal ranks bottom and scores high", () => {
    // 13 peers, no zeros, healthy spread
    const healthy = buildSignalRanker([...nValues(12, 5), 1])!;
    const obscure = place({ sitelinks: 0, protectionStatus: true });
    const r = unsungScore(obscure, { sitelinks: healthy, pageviews: null, reviewCount: null }, profile("heritage"), STAGE_A_MIN_OBSERVED);
    // rank(0) = 0 → inverse = 1 − 0 = 1 (no floor needed)
    assert.equal(r.popularity, 0);
    okClose(0.5 * 1, r.score);
});

// ─── eligibility & verify pool ───────────────────────────────────────────────

test("zero-confidence places cannot shortlist without verification", () => {
    assert.equal(shortlistEligible(place({}), false), false);
    assert.equal(shortlistEligible(place({}), true), true, "verified bypasses");
    assert.equal(shortlistEligible(place({ hasDescription: true }), false), true);
});

test("confidence counts only true flags; dropped false is genuinely zero", () => {
    const p = place({ hasWikipediaEntry: false, hasDescription: true, hasPhoto: false });
    okClose(1 / 3, confidence(p));
});

test("verify pool: deterministic per seed, bounded, differs across seeds", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => i + 1);
    const a = pickVerifyPool(candidates, "seed-a", 5);
    const aAgain = pickVerifyPool(candidates, "seed-a", 5);
    assert.deepEqual(a, aAgain, "same seed → identical picks (stable cards)");
    assert.equal(a.length, 5);
    const b = pickVerifyPool(candidates, "seed-b", 5);
    assert.notDeepEqual(a, b, "per-user variation is the whole point of the pool");
});

test("verify pool smaller than size returns everything", () => {
    assert.equal(pickVerifyPool([1, 2, 3], "s", 5).length, 3);
});

// ─── tiered peer resolution ──────────────────────────────────────────────────

test("tier widening: too-few same-category peers fall back to the full set", () => {
    const few = nPlaces(3, { sitelinks: 1 }); // heritage tier (default category)
    const otherCategory = nPlaces(12, { sitelinks: 5, category: "nature" });
    const bigTier = [...few, ...otherCategory];
    const rankers = peerRankersFor([few, bigTier]);
    if (rankers.sitelinks === null) {
        assert.ok(false, "tier 2 must yield a usable sitelinks ranker");
        return;
    }
    assertRanker(rankers.sitelinks, 5, 9 / 15, "(3×1 below, ties 12 → mid-rank 3+6=9 → 0.6)");
});

test("no usable tier → all-null rankers (popularity genuinely unknown)", () => {
    const tiny = nPlaces(5, { sitelinks: 1 });
    assert.deepEqual(peerRankersFor([tiny]), emptyRankers());
});

// ─── flag extraction (regression: `heritage` ≠ `historic`) ──────────────────

test("the queried category tag is NOT a protection signal", () => {
    // historic=castle is on EVERY heritage candidate by construction of the
    // Overpass query — treating it as protection would make quality meaningless.
    const empty = flagsFromOsmTags({ historic: "castle", name: "x" }, "heritage");
    assert.equal(empty.protectionStatus, undefined, "historic=* must not count as protection");
});

test("real OSM protection keys ARE detected", () => {
    assert.equal(flagsFromOsmTags({ historic: "castle", heritage: "8", name: "x" }, "heritage").protectionStatus, true);
    assert.equal(flagsFromOsmTags({ historic: "manor", listed_status: "B", name: "x" }, "heritage").listedGrade, true);
    assert.equal(flagsFromOsmTags({ historic: "monastery", "contact:website": "https://x", name: "x" }, "heritage").hasWebsite, true);
    assert.equal(flagsFromOsmTags({ historic: "ruins", opening_hours: "Mo-Su", name: "x" }, "heritage").hasOpeningHours, true);
});

test("nothing at all → no flags, quality contribution 0", () => {
    // Note: explicit-undefined keys still differ from absent keys under
    // deepStrictEqual; assert that no flag is truthy instead.
    const none = flagsFromOsmTags({ name: "x" }, "heritage");
    assert.ok(
        !none.protectionStatus && !none.listedGrade && !none.hasWebsite && !none.hasOpeningHours,
        `expected all flags non-truthy, got ${JSON.stringify(none)}`,
    );
});

// ─── assertions ──────────────────────────────────────────────────────────────

function okClose(expected: number, got: number, note = ""): void {
    assert.ok(
        close(expected, got),
        `expected ${expected}, got ${got}${note ? ` (${note})` : ""}`,
    );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
