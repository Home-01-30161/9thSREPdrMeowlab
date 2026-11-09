/**
 * Unsung mode, phase 1: category ids + Overpass tag matrix.
 *
 * The tag matrix is the single source of truth for which OSM tags produce
 * candidates per category. Categories added beyond these must define both a
 * tag selector AND a quality profile (see profiles.ts) before they can be
 * scored — a category without a profile would ship with an empty scoring core.
 *
 * Filters are exact-value matches on curated key sets. A narrow whitelist
 * keeps payloads small, and small payloads matter a lot on Workers (10 ms
 * free / 30 s paid CPU is spent on JSON.parse of the whole response).
 */

export const CATEGORY_IDS = ["heritage", "nature"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface TagFilter {
    key: string;
    values: readonly string[];
}

export const TAG_MATRIX: Record<CategoryId, readonly TagFilter[]> = {
    heritage: [
        {
            // Curated subset of `historic` — the full key includes items we
            // never want on a travel shortlist (memorial on every corner,
            // wayside crosses, milestones).
            key: "historic",
            values: ["castle", "ruins", "manor", "monastery", "fort", "fortress", "military", "tower"],
        },
    ],
    nature: [
        { key: "natural", values: ["waterfall", "cave_entrance", "geyser", "hot_spring"] },
        // Viewpoints: only named ones survive (the parser drops unnamed), and
        // the per-category element cap bounds how much of this list a busy
        // region can consume.
        { key: "tourism", values: ["viewpoint"] },
    ],
};

/** Overpass filter snippets for one category, returning one selector per filter group for proper union. */
export function tagSelectors(category: CategoryId): string[] {
    return (TAG_MATRIX[category] || []).map((f) => `["${f.key}"~"^(${f.values.join("|")})$"]["name"]`);
}

/** Categories the user may request; defaults to all phase-1 categories. */
export function normalizeCategories(categories?: readonly string[]): CategoryId[] {
    const allowed = categories
        ?.map((c) => CATEGORY_IDS.find((id) => id === c))
        .filter((id): id is CategoryId => id != null);
    return allowed && allowed.length > 0 ? allowed : [...CATEGORY_IDS];
}
