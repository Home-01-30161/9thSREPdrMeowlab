import { CATEGORY_IDS, type CategoryId } from "./tagMatrix";

/**
 * Unsung mode: per-category quality profiles and flag extraction.
 *
 * Quality is deliberately per-category (see unsung-mode-design.md): a global
 * quality function built around heritage tags leaves food, villages, and
 * viewpoints with a nearly empty quality term. Flags are extracted here so
 * score.ts stays a pure math module.
 */

export { CATEGORY_IDS } from "./tagMatrix";
export type { CategoryId } from "./tagMatrix";

/** Quality-relevant flags (intrinsic worth; documentation lives in confidence). */
export interface QualityFlags {
    protectionStatus?: boolean; // heritage/protection tags in OSM
    listedGrade?: boolean;      // explicit listing (listed_status, heritage=)
    hasWebsite?: boolean;
    hasOpeningHours?: boolean;
}

/** Confidence-relevant documentation flags (untrusted-verified ≠ worth). */
export interface ConfidenceFlags {
    hasWikipediaEntry?: boolean;
    hasDescription?: boolean;
    hasPhoto?: boolean;
}

/** One scoreable place. Fields are filled progressively by the pipeline. */
export interface UnsungPlace {
    id: string;   // "osm:node/12345" — stable for dedupe and UI keys
    name: string; // sanitized external text
    category: CategoryId;
    region: string;
    lat: number;
    lng: number;

    // Wikidata QID from the OSM `wikidata` tag (the bulk WDQS join key).
    // Absent means the place must rely on OSM-native metadata only; that is
    // fine per the design ("lower confidence, flows through the verify pool").
    qid?: string;

    // Popularity signals. `sitelinks` is filled (0 = queried and absent, an
    // observation) when the bulk WDQS call covers this candidate; undefined
    // when that call failed or was skipped. See design doc: queried-and-absent
    // counts as an observation, missing ≠ 0.
    sitelinks?: number;
    pageviews?: number;
    reviewCount?: number;

    // Quality flags (intrinsic only — interest match is a filter upstream)
    protectionStatus?: boolean;
    listedGrade?: boolean;
    hasWebsite?: boolean;
    hasOpeningHours?: boolean;

    // Confidence flags
    hasWikipediaEntry?: boolean;
    hasDescription?: boolean;
    hasPhoto?: boolean;
}

export interface QualityProfile {
    readonly id: CategoryId;
    /** Flag → weight map. Weights within a profile should sum to 1.0. */
    readonly weights: readonly { flag: keyof (QualityFlags & ConfidenceFlags); weight: number }[];
}

const QUALITY_PROFILES: Record<CategoryId, QualityProfile> = {
    heritage: {
        id: "heritage",
        weights: [
            { flag: "protectionStatus", weight: 0.5 },
            { flag: "listedGrade", weight: 0.2 },
            { flag: "hasWebsite", weight: 0.15 },
            { flag: "hasOpeningHours", weight: 0.15 },
        ],
    },
    nature: {
        id: "nature",
        weights: [
            { flag: "protectionStatus", weight: 0.5 },
            { flag: "hasWebsite", weight: 0.25 },
            { flag: "hasOpeningHours", weight: 0.25 },
        ],
    },
};

export function profile(category: CategoryId): QualityProfile {
    const p = QUALITY_PROFILES[category];
    if (!p) throw new Error(`No quality profile defined for category "${category}"`);
    return p;
}

/** Raw OSM tags subset used for flag extraction. */
export type OsmTags = Record<string, string>;

/** Maps Overpass element tags into quality flags. */
export function flagsFromOsmTags(tags: OsmTags, _category: CategoryId): QualityFlags {
    // `_category` reserved for category-specific OSM-only flags (waymarked
    // trails for nature, opening-hours weighting for viewpoints).
    //
    // CAUTION: the queried category tag (`historic=castle` etc.) is NOT a
    // protection signal — every candidate has it by construction. OSM's
    // `heritage=*` / `listed_status` / `protection_title` family marks real
    // listings; the rest comes from Wikidata (P1435) in the bulk join.
    const protectionKeys = [
        "heritage",
        "heritage:operator",
        "listed_status",
        "protection_title",
        "protection",
    ];
    const protection = protectionKeys.some((k) => tags[k] != null);
    const listed = tags.listed_status != null || tags["heritage:operator"] != null;
    const website = tags.website != null || tags.url != null || tags["contact:website"] != null;
    return {
        protectionStatus: protection || undefined,
        listedGrade: listed || undefined,
        hasWebsite: website || undefined,
        hasOpeningHours: tags.opening_hours != null || undefined,
    };
}
