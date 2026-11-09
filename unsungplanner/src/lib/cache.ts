import { cacheGet, cacheSet, takeSlot } from "./db";

/**
 * Server-only cache + quota backed by Neon Postgres (src/lib/db.ts).
 *
 * Quotas are enforced through the atomic `take_slot` SQL function (see
 * neon/migrations). Without Neon a per-instance in-memory limiter is
 * used instead, so the app never runs with no ceiling at all.
 *
 * If Neon isn't configured, caching silently degrades but the app works.
 */

/** Returns the cached value if fresh, otherwise runs fn and stores a non-null result. Cache failures never break a request. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T | null>): Promise<T | null> {
    const hit = await cacheGet<T>(key);
    if (hit != null) return hit;

    const fresh = await fn();

    if (fresh != null) {
        await cacheSet(key, fresh, new Date(Date.now() + ttlSeconds * 1000).toISOString());
    }
    return fresh;
}

// ─── Quota / rate limiting ────────────────────────────────────────────────────

type Counter = { count: number; resetAt: number };
const localCounters = new Map<string, Counter>();
const LOCAL_MAX_KEYS = 5_000;

function pruneLocal(now: number): void {
    for (const [key, entry] of localCounters) {
        if (entry.resetAt <= now) localCounters.delete(key);
    }
    // Pathological traffic from many IPs: start over rather than grow forever.
    if (localCounters.size >= LOCAL_MAX_KEYS) localCounters.clear();
}

/**
 * Per-instance fallback limiter. Serverless instances do not share this map,
 * so it is weaker than the database counter — but it still caps a single
 * instance, and it never fails open.
 */
export function consumeSlotLocal(key: string, limit: number, ttlSeconds: number): boolean {
    if (limit <= 0) return false;
    const now = Date.now();
    if (localCounters.size >= LOCAL_MAX_KEYS) pruneLocal(now);

    const entry = localCounters.get(key);
    if (!entry || entry.resetAt <= now) {
        localCounters.set(key, { count: 1, resetAt: now + ttlSeconds * 1000 });
        return limit >= 1;
    }
    entry.count += 1;
    return entry.count <= limit;
}

/**
 * Atomically counts one hit for `key` and returns true while the count is
 * within `limit`. Uses the `take_slot` SQL function when Neon is available
 * (shared across all instances); otherwise falls back to the local map.
 */
export async function consumeSlot(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    if (limit <= 0) return false;

    const verdict = await takeSlot(key, limit, ttlSeconds);
    if (verdict !== null) return verdict;

    return consumeSlotLocal(key, limit, ttlSeconds);
}

/** Global daily cap so a public deployment can't burn the free API quotas. */
export async function takeDailyPlanSlot(limit: number, todayIso: string): Promise<boolean> {
    return consumeSlot(`quota:${todayIso}`, limit, 2 * 86_400);
}
