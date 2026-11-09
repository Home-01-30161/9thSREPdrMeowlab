# Unsung Mode: Design Notes

## Goal

Let users discover local, lesser-known places that offer an authentic, uncrowded experience. The idea is to move away from the usual top-10 tourist lists and toward real local discovery.

Example: travelling to a small, unfamous town in Germany and stumbling on a castle. Castles are only one example. Unsung mode covers any kind of place or experience that is worthwhile but overlooked.

## What counts as "unsung"?

A place is unsung when it is **worth visiting** but **little known to tourists**. Both conditions matter. Obscure but boring is useless.

Categories (not exhaustive):

| Type | Examples | Phase |
|---|---|---|
| Heritage | Small castles, ruins, chapels, old mills, fortifications | 1 |
| Nature | Waterfalls, caves, lakes, forest trails, viewpoints | 1 |
| Towns and villages | Quiet old towns, hill villages, river towns | 2 |
| Culture | Small local museums, workshops, galleries, street art | 2 |
| Food and drink | Family bakeries, local markets, village breweries, regional eateries | 2 |
| Activities | Local trails, cycling routes, swimming spots, craft studios | 2 |
| Industrial and quirky | Old mines, railways, lighthouses, unusual local landmarks | 3 |
| Events | Village festivals, seasonal markets, local traditions | deferred |

Events are deferred: OSM and Wikidata coverage for local events is near zero and data is seasonal. Source them later only via the shortlist enrichment step (Tavily / local tourism feeds), not as Overpass candidates.

## Core concept: the unsung score

```
unsung = quality x (1 - popularity)
  popularity unknown  ->  quality x UNKNOWN_WEIGHT x (0.25 + 0.75 x confidence)
  popularity known    ->  quality x max(1 - popularity, INVERSE_FLOOR)
```

**"Queried and absent" counts as an observation, not missing data.** When the bulk Wikidata lookup answers, a place with no match has `sitelinks = 0` — observed, not unknown. Same for pageviews (0 monthly views is an observation). Missing data means the lookup failed or was never attempted. This distinction matters: measured obscurity is data; absence of a lookup is not a free win on the unsung score.

Undocumented places (confidence 0) do not reach the shortlist on score alone — even a well-earned obscure score from observed absence doesn't prove the place is worth visiting. They flow through the verify pool instead — see the note after the scoring sketch.

Popularity is measured **relative to the category and region**, not globally. A small chapel with 500 monthly Wikipedia views might be famous locally, while the same number for a village bakery would be huge. Compare each place against its peers.

### Three separate factors, not two

- **Quality** — intrinsic worth: protection/heritage status and other **category-specific** tags, plus operational evidence. Never includes "has a Wikipedia page" (documentation and popularity are the same underlying signal), and never includes interest match — relevance to the user is a **filter**, not worth. A global quality function would leave categories without heritage tags nearly empty, which is why quality is a per-category weight table (see *Quality and popularity signals per category* below).
- **Popularity** — how mainstream the place is, peer-relative, computed **in two stages** (cheap prefilter from sitelinks, full score after pageviews).
- **Confidence** — how much data we have at all. A place with no Wikipedia entry, no photo, and no description is *unknown*, not *verified hidden*. Confidence gates shortlist eligibility: a high score on a data-less place goes through verification, not straight to the user.

### Popularity signals (higher means more mainstream)

- Wikidata sitelinks (number of language editions) — the primary signal; available in bulk. Because a bulk lookup covers every candidate, **sitelinks is always observed** after step 3 (0 when absent)
- Wikipedia pageviews (monthly) — secondary; only fetched for top-K candidates
- Mainstream "top 10" travel list appearances (checked via Tavily) — strong signal, rare
- Review counts — **optional and rare**: we do not depend on a Google Places integration, so this is usually unobserved. Skipped unless the data happens to exist

Timing caveat: the Tavily mainstream check runs on the **shortlist** (flow step 7), so it cannot be a pre-scoring input. Its role there is a final veto/demotion. Before the shortlist, "mainstream" means SerpAPI ranking position (or local review-count proxy) observed in step 6, or simply unobserved.

Stage caveat: only sitelinks are observed before step 6, so the "at least two observed signals" rule for a *full* popularity score cannot apply at the prefilter. The prefilter computes a **provisional** popularity from sitelinks percentiles alone; pageviews are fetched for stage-A survivors, and the full score with two observed signals happens there.

### Quality and popularity signals per category

There is no one global quality function and no one global popularity mix — each category has a signal profile (weight table, kept in a config file alongside the tag matrix). Phase-2 categories (food, culture) have almost no Wikidata presence, so they need their own profile before their build phase, or they ship with an empty scoring core.

| Category (phase) | Intrinsic quality signals | Popularity sources |
|---|---|---|
| Heritage (1) | protection/heritage tag, listed-building grade, operational evidence | sitelinks, pageviews |
| Nature (1) | protected-area tags, trail infrastructure (waymarked, viewing platform), coords accuracy | sitelinks, pageviews |
| Towns / villages (2) | protected-monument count in the settled core, official designations | sitelinks + pageviews on the settlement node |
| Culture (2) | operator/registered-museum tags, opening hours | review/ranking proxy (SerpAPI `google_local`), Tavily mentions; wiki signals usually absent |
| Food and drink (2) | operational evidence, traditional/cuisine tags, rare awards | review counts (SerpAPI `google_local`), ranking proxy; wiki signals mostly absent |
| Activities (2) | waymarked-route tags, maintained status, route length | Tavily mentions, route/ranking proxy |
| Industrial / quirky (3) | heritage tag, operational evidence | sitelinks, pageviews |

Two rules constant across all profiles:

- **Operational evidence** (`opening_hours`, `website`, `condition=` values) is a quality input: it is the cheapest way to exclude abandoned/rubble candidates, which matters because absences now score high.
- **Interest match is a filter, applied at the prefilter stage**, never a quality term. It selects *which* candidates get scored, not how worthy they are.

### Confidence signals (documentation)

- Has a Wikipedia or Wikidata entry
- Has a description or photo on OSM or Wikimedia
- Has any other sourced metadata (opening hours, website)

### Bonuses

- Small-town or rural location
- Reachable by public transport or a reasonable drive
- Clustered near other unsung places (good for itineraries)

## Runtime constraints (Cloudflare Workers)

The planner runs on Workers (`wrangler.jsonc`, `run_worker_first: ["/api/*"]`). Three hard limits shape the design:

- **CPU time per invocation:** 10 ms on the free plan; paid defaults to 30 s (configurable up to 5 min). Waiting on network does not count, but parsing a multi-MB Overpass response and scoring a few hundred candidates is pure CPU work — JSON parsing alone will blow the free plan's 10 ms on any realistic response. Heavier-than-average production Workers measure 10–20 ms.
- **Outbound fetches (subrequests) per request:** 50 on the free plan; 10,000 on paid. Bulk-fetching is the discipline anyway, but the real free-plan killer is CPU parse time, not request count.
- **Simultaneous open connections:** 6 per request — batch obligations where possible (e.g. fetch Overpass and WDQS in parallel, then pageviews in small waves).

Consequence: **budget for Workers Paid (~$5/month)** for this feature, or keep Overpass payloads so small (hard response caps, minimal tags per element, tiny bboxes) that free works for demo-sized regions only. Wall-clock duration is *not* the binding constraint — an HTTP-triggered Worker has no hard duration limit — so a slow Overpass response is survivable; the parse is what isn't.

Consequences baked into the flow below:

- Wikidata data (sitelinks, descriptions, images, coords, tags) comes from **one SPARQL query per region** via the Wikidata Query Service, not per-place REST calls.
- Wikipedia pageviews (per-article REST calls) are fetched **only after the deterministic prefilter**, for the top-K candidates (K ≈ 50).
- Overpass queries always specify an explicit bbox, `[out:json][timeout:60]`, `out center` (dedupes way/relation multipolygon geometry), and a curated tag whitelist — never "everything in region X".
- `plan/route.ts`'s `maxDuration: 60` comment is stale — this is Workers, not Vercel.

## Data sources

| Source | Use | Notes |
|---|---|---|
| Nominatim (or GeoNames) | Resolve the user's region (city / admin area) into a **bbox** | Prerequisite; the existing Open-Meteo geocoding returns a point only, which is not enough. Mind Nominatim policy: 1 req/s, set a User-Agent |
| Overpass API | Candidate places by tag within the bbox | Free, global; bounded queries only (bbox, tag whitelist, `out center`) |
| Wikidata Query Service (SPARQL) | Sitelinks, descriptions, images, coords, heritage tags — **one bulk call** | Join candidates to Wikidata via their OSM `wikidata`/`wikipedia` tags where present. Candidates without those tags keep only OSM-native metadata (historic tags, image, website) — that is fine, they simply have lower confidence and flow through the verify pool |
| Wikipedia pageviews REST | Popularity for top-K candidates only | Per-article endpoint; never per-candidate |
| Tavily | Mainstream-list check + local-tips enrichment for the shortlist | Reuse existing call budgeting discipline from `src/lib/connectors/travelData.ts` |
| SerpAPI `google_local` | Mainstream detection (top-10 lists, local rankings) + **phase-2 popularity proxy** (review counts / rank position) for categories with no wiki signal | Returns mostly *popular* places — never used to *find* candidates, only to measure the ones Overpass already found. No Google Places storing concerns this way; ratings/reviews from Google are not persisted (Neon or otherwise) |

Caching: no new infrastructure. Use the existing `cached()` helper in `src/lib/cache.ts` (Neon-backed `api_cache` table). Cache keys: region + tag-set fingerprint; TTL of days for Overpass/WDQS, hours for pageviews. Cache failures degrade silently, as elsewhere.

Untrusted content rule: OSM descriptions, Wikipedia extracts, and Tavily/blog text all flow into LLM prompts by reference. Pass them through `sanitizeUntrusted` (`src/lib/security.ts`) and preserve the existing separation between sanitized web text and instructions. Assume local blogs can be SEO junk that misrepresents the place; treat their claims as verify-before-display.

## LangGraph flow

1. **Parse intent:** region, interests, travel style, how remote, transport. zod-validated on the server (like `PlanRequest`), not client-only.
2. **Resolve region → bbox** (Nominatim/GeoNames), cached.
3. **Candidate fetch:** one bounded Overpass query for the selected categories (server-mapped from a tag-matrix file), then one bulk WDQS SPARQL call for the resulting IDs.
4. **Score, stage A (cheap):** category-specific quality + **provisional** popularity from sitelink percentiles alone. This works at this stage only because "queried and absent = 0 sitelinks" makes the signal observed for every WDQS-covered candidate — otherwise a `STAGE_B_MIN_OBSERVED = 2` rule would return null for nearly everyone here. No LLM.
5. **Prefilter:** drop places above the weighted popularity threshold, below the category quality minimum, or not matching the user's interests (interest match is a filter, see Signals). Zero- or low-confidence places do not flow to the shortlist on score alone — they go to a "needs verification" pool: quality-ranked among themselves and sampled per request (seeded, see Pitfalls), not score-ranked.
6. **Score, stage B + pageviews:** per-article REST calls for the top-K stage-A survivors only; recompute the **full** popularity (at least two observed signals: sitelinks + pageviews) and re-rank. Candidates that still have only one observed signal keep their provisional stage-A score scaled down by `UNKNOWN_WEIGHT × confidence`.
7. **Verify and enrich:** Tavily (mainstream veto) + LLM on only the top ~10, sampled per user/region — confirm the place is real, open, reachable, add a local tip.
8. **Itinerary:** group nearby places, route them, add transport notes.

Design principle unchanged: heavy filtering in deterministic code, LLM only for the final shortlist.

## Scoring sketch (TypeScript)

```ts
type Place = {
  id: string;
  category: string;
  region: string;

  // Popularity signals — `undefined` means "no data / lookup failed",
  // distinct from 0 meaning "queried and absent", which IS an observation.
  sitelinks: number;        // filled for every WDQS-covered candidate (0 = no match)
  pageviews?: number;       // stage B only (observed 0 = article exists but no views)
  inMainstreamLists?: boolean;
  reviewCount?: number;     // rare; usually unobserved

  // Quality flags — which ones exist depends on the category profile.
  heritageTag?: boolean;
  protectionStatus?: boolean;
  hasOpeningHours?: boolean;
  hasWebsite?: boolean;
  // ... per-category flags, see the profile table

  // Confidence — documentation; observed false is an observation, unknown is undefined
  hasWikipediaEntry?: boolean;
  hasDescription?: boolean;
  hasPhoto?: boolean;
};

const STAGE_A_MIN_OBSERVED = 1;   // sitelinks only (0 counts — it was queried)
const STAGE_B_MIN_OBSERVED = 2;   // sitelinks + pageviews
const MIN_PEERS = 10;             // minimum peers with data for a usable percentile
const ZERO_SIGNAL_FRACTION = 0.7; // if this many peers are zero, the signal can't discriminate
const POPULARITY_UNKNOWN_WEIGHT = 0.6;
const POPULARITY_INVERSE_FLOOR = 0.15;

// Percentile ranker with mid-rank ties, zeros assigned rank 0.
// Bug being avoided: counting with `v <= value` ranks a zero-view place at the 80th
// percentile when 80% of peers are zero — looking "popular" for being undocumented,
// the exact inverse of reality. Zeros are instead given the bottom rank (their absence
// is observed), and when the zero-fraction is too high the signal declines to rank.
type Ranker = (value: number) => number; // 0..1 percentile

function percentile(values: number[], value: number): number {
  // values: presorted, nonzero peer values. Called only with value > 0.
  const below = bisectLeft(values, value);          // strictly below
  const ties = bisectRight(values, value) - below;  // equal (mid-rank splits them)
  return (below + ties / 2) / values.length;
}

function signalRanker(
  field: "sitelinks" | "pageviews" | "reviewCount",
  peers: Place[]
): Ranker | null {
  const nonzero = peers
    .map(p => p[field])
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (nonzero.length < MIN_PEERS) return null;                             // too few data points
  if (nonzero.length / peers.length < 1 - ZERO_SIGNAL_FRACTION) return null; // mostly zeros, non-discriminative
  const sorted = [...nonzero].sort((a, b) => a - b);
  return (value: number) => {
    if (value <= 0) return 0; // observed absence ranks bottom
    return percentile(sorted, value);
  };
}

// Tiered peer resolution: narrowest scope first, widen while the tier has enough
// peers. Tier 1: same category, same region. Tier 2: same category, nearby regions.
// Tier 3: related categories in the region (fallback, flagged in the response).
// A signal with no usable ranker contributes nothing — it declines instead of lying.
type PeerRankers = {
  sitelinks: Ranker | null;
  pageviews: Ranker | null;
  reviewCount: Ranker | null;
};

function peerRankersFor(tiers: Place[][]): PeerRankers {
  for (const peers of tiers) {
    if (peers.length < MIN_PEERS) continue; // widen scope
    return {
      sitelinks:   signalRanker("sitelinks",   peers),
      pageviews:   signalRanker("pageviews",   peers),
      reviewCount: signalRanker("reviewCount", peers),
    };
  }
  // No tier reached MIN_PEERS — all-null rankers, so popularity is genuinely unknown.
  return { sitelinks: null, pageviews: null, reviewCount: null };
}

// Category profile: weight table loaded from config (like the tag matrix), not branch logic.
type QualityProfile = ReadonlyArray<{ flag: keyof Place; weight: number }>;

function quality(p: Place, profile: QualityProfile): number {
  let q = 0;
  for (const { flag, weight } of profile) {
    if (p[flag]) q += weight;
  }
  return q;
}

// 0–1, or null when too few observed signals to trust. Absent-but-queried zeros
// are observed and included; genuine no-data is excluded. Concretely:
// stage A passes STAGE_A_MIN_OBSERVED (sitelinks alone), stage B STAGE_B_MIN_OBSERVED.
function popularity(p: Place, rankers: PeerRankers, minObserved: number): number | null {
  const parts: number[] = [];
  if (rankers.sitelinks)   parts.push(rankers.sitelinks(p.sitelinks));
  if (p.pageviews !== undefined && rankers.pageviews) parts.push(rankers.pageviews(p.pageviews));
  if (p.inMainstreamLists !== undefined) parts.push(p.inMainstreamLists ? 1 : 0);
  if (p.reviewCount !== undefined && rankers.reviewCount) parts.push(rankers.reviewCount(p.reviewCount));
  if (parts.length < minObserved) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// Confidence 0–1: documentation signals (wikipedia/wikidata presence, description, photo).
// With the bulk join, hasWikipediaEntry=false is an observation — real, but it does
// not make the place worthless; it only gates shortlist eligibility (see unsungScore note).
function confidence(p: Place): number {
  const parts = [p.hasWikipediaEntry, p.hasDescription, p.hasPhoto];
  return parts.filter(Boolean).length / parts.length;
}

function unsungScore(
  p: Place,
  rankers: PeerRankers,
  profile: QualityProfile,
  minObserved: number
): number {
  const q = quality(p, profile);
  const pop = popularity(p, rankers, minObserved);
  const inverse =
    pop === null
      ? POPULARITY_UNKNOWN_WEIGHT * (0.25 + 0.75 * confidence(p)) // unknown popularity: scale by how much we actually know
      : Math.max(1 - pop, POPULARITY_INVERSE_FLOOR);
  return q * inverse;
}

// Eligibility, not score, protects against "observed absence = free obscurity win":
function shortlistEligible(p: Place, verified: boolean): boolean {
  // Confidence: a place with confidence 0 (no documentation at all) that also
  // has observed-zero sitelinks can score near-maximum unverified. Zero-confidence
  // places must clear the verify pool first; after verification they recompute
  // with real hasDescription/hasPhoto/operational data.
  return verified || confidence(p) > 0;
}
```

Notes:

- **Two stages prevent signal starvation.** Before pageviews exist, only sitelinks are observed — a blanket "2 observed signals" rule would return null for nearly everyone at the prefilter. Stage A uses sitelinks alone (queried-and-absent = observed 0, so it always exists); stage B requires the full complement after pageviews, and falls back to `UNKNOWN_WEIGHT × (0.25 + 0.75 · confidence)` for anything still one-signal.
- **Ties break naive percentiles.** `v <= value` counting ranks a zero-view place at the 80th percentile when 80% of rural peers are zero — it would look popular for being undocumented. Zeros therefore get the bottom rank; ties among nonzero values get mid-rank; and a zero-fraction ≥ `ZERO_SIGNAL_FRACTION` makes the ranker decline entirely (non-discriminative signal) rather than lie.
- **The inverse floor is for the top end, not the zeros.** `POPULARITY_INVERSE_FLOOR` only stops fully-mainstream peers (percentile 1) from inverting to exactly 0. Zeros and sparse data are handled by the ranker rules above, not by the floor.
- **Eligibility, not the score, guards "absence ≠ worth".** With queried-and-absent observations, an undocumented place can legitimately score high (observed zero popularity). What stops it from shortlisting on that alone is `shortlistEligible`: zero-confidence places must clear the verify pool — quality-ranked among themselves, sampled seeded per request — and verification fills in description/photo/operational data, after which the score is recomputed with real values.
- Tiering prevents the empty-set problem: with 3 castles in a region, the median one would otherwise score 0.67 popularity by construction. Use the binary-search helpers in the returned ranker, not `filter`, in the real implementation.
- Peers and computed rankers are reused across all candidates of a category-region pair in a single request.

## UI ideas

- An "Unsung mode" toggle.
- A slider from "a bit quieter" to "truly hidden" — maps to a **server-validated** popularity threshold, not client display.
- Category chips — map to the tag-matrix categories on the server (zod-validated request params).
- Map pins colored by unsung score (normalize within the returned result set).
- Each card explains why it is unsung (for example, "no English Wikipedia page, about 200 monthly views").
- Access info on each card: nearest train station, drive time, best time to visit.
- Low-confidence cards show a "verification low" badge rather than looking identical to confirmed hits.

## Pitfalls

- **Missing data looks like obscurity.** Now handled in two halves: *queried-and-absent* (0 sitelinks after a bulk lookup) is an **observation** and legitimately measures obscurity — but eligibility, not the score, makes sure observably-undocumented places are verified before they shortlist (`shortlistEligible`, verify pool). *Genuinely missing* lookups (`undefined`) stay distinct from 0 and scale the score by confidence, with a small floor (`0.25 × UNKNOWN_WEIGHT`) so unknown popularity can never zero a place out entirely.
- **Signal starvation between stages.** Only sitelinks are observed before pageviews are fetched. A single popularity rule with `MIN_OBSERVED = 2` would return null for nearly everyone at the prefilter. Two stages: provisional sitelinks-only score, then a full recomputation plus a fallback for one-signal places.
- **Ties break percentiles.** Linear `v <= value` tie handling ranks a zero-view place at the 80th percentile when 80% of peers are zero. Mid-rank + zeros ranked bottom + zero-fraction guard is the fix; the floor is not.
- **Quality is category-specific.** A global quality function built around heritage tags leaves food, villages, and viewpoints with a nearly empty quality term. Per-category weight profiles, with interest match as a filter, not a quality bonus.
- **Category data profiles.** Food/culture candidates rarely have sitelinks or pageviews, and reviews are usually unobserved — those categories need their own popularity sources (SerpAPI rank/review proxies, mention counts) defined before their build phase, or phase 2 ships with an empty scoring core.
- **Sparse peer sets.** Percentile among tiny groups is noise. Tiered peer resolution with a `MIN_PEERS` floor (see sketch).
- **Hard to reach.** Very remote places may have no transport. Show access info and let users filter by it.
- **Sensitive or private places.** OSM tags cannot detect local sensitivities. Avoid private land, fragile habitats, and places locals want left alone; the shortlist prompt asks the LLM to flag these.
- **Success erodes the point.** If many users get the same suggestions, they stop being unsung. Randomize the final ordering/selection — but seeded per `(user, region)` hash so a given user's map is stable across reloads while sets still differ between users.
- **Seasonal closures.** Small places often have irregular hours. Verify before recommending.
- **Language bias.** Popularity signals skew English. For non-English regions, sitelinks already count all languages; check the local-language Wikipedia too (for a Thai-region plan, Thai Wikipedia pageviews are the better signal than English ones).
- **Service fragility.** If Overpass or WDQS is down or returning garbage, only unsung mode is down, not the whole planner. Degrade: fall back to the previous cached candidate set, or surface a "stale data" state rather than an error page.

## Cost notes

- Scoring in plain code costs nothing.
- Bulk WDQS + bounded Overpass: **2 subrequests** per candidate batch, plus K pageviews calls, all under the Workers subrequest cap.
- LLM only on the shortlist (top ~10), consistent with the plan flow's single-LLM-call budgeting.
- Cap Tavily calls per request (see `travelData.ts` budget discipline).
- Cache Overpass/WDQS/Nominatim results in `api_cache` keyed by region + categories, so repeat requests cost nothing.
- Rate limiting: leverages the existing `public.take_slot` (per-IP + global counters); no new plumbing beyond possibly a higher per-IP cost weight for unsung mode.

## Suggested build order

1. Region → bbox resolver (Nominatim), cached, with a User-Agent policy check.
2. Overpass tag matrix file (category → tag filters, incl. way/relation dedup rules) + one bounded, cached query for one category in one region.
3. Bulk WDQS enrichment join (sitelinks, coords, images, tags) in one SPARQL call.
4. Scoring: two-stage popularity (stage A sitelinks-only prefilter, stage B full after pageviews), mid-rank percentile + zero-fraction guard, observed-vs-missing distinction, tiered peers. Unit tests must cover the percentile edge cases: all-zeros tie block, ties among nonzero values, fewer than MIN_PEERS peers, zero-fraction above the guard threshold.
5. Wikipedia pageviews for top-K only, after the prefilter.
6. Reuse the existing graph pattern (new mode or subgraph in `travelGraph.ts`); `sanitizeUntrusted` on all external text; Tavily/LLM limited to the shortlist.
7. UI toggle, slider, category chips wired to server-validated params; map colors.
8. Expand to more categories and regions, each **with its signal profile defined first** — food/culture need the review/rank proxy wired up before their candidates can be scored at all.
