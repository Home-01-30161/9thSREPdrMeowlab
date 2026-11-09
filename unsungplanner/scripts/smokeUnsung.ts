/**
 * Live smoke test for the unsung pipeline (run ad hoc, not in CI):
 *   npx tsx scripts/smokeUnsung.ts [region] [categories CSV]
 * Hits real Overpass/WDQS/Nominatim — keyless, one bounded round each.
 */
import { unsungShortlist } from "../src/lib/unsung/index";

const region = process.argv[2] ?? "Bamberg, Germany";
const categoriesCsv = process.argv[3];

const run = async () => {
    const timer = setTimeout(() => console.log("…still running (Overpass can take ~60s on cold cache)"), 15_000);
    try {
        const started = Date.now();
        const result = await unsungShortlist({
            region,
            categories: categoriesCsv ? categoriesCsv.split(",") : undefined,
        });
        clearTimeout(timer);
        console.log(`\n== unsung smoke: "${region}" (${((Date.now() - started) / 1000).toFixed(1)}s)`);
        console.log(`bbox label: ${result.label}`);
        console.log(`notes: ${result.notes.length ? result.notes.join(", ") : "(none)"}`);
        console.log(`results: ${result.results.length}, verifyPool: ${result.verifyPool.length}`);
        for (const p of result.results.slice(0, 8)) {
            console.log(
                `  ${p.score.toFixed(3)}  q=${p.quality.toFixed(2)} pop=${p.popularity === null ? "unknown" : p.popularity.toFixed(2)} conf=${p.confidence.toFixed(2)} sl=${p.sitelinks ?? "?"}  ${p.name} [${p.category}]`,
            );
        }
        for (const p of result.verifyPool.slice(0, 3)) {
            console.log(`  pool: q=${p.quality.toFixed(2)} conf=${p.confidence.toFixed(2)} ${p.name}`);
        }
    } finally {
        clearTimeout(timer);
    }
};

void run();
