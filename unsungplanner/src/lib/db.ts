import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Server-only Neon Postgres access (used for cache, quota and chat storage).
 *
 * Connects with a direct serverless driver over the NEON_DATABASE_URL
 * connection string, which is SERVER ONLY and must never be prefixed with
 * NEXT_PUBLIC_. The connection runs as the database owner, so RLS on these
 * tables is bypassed exactly like Supabase's service role before the
 * migration (see neon/migrations).
 *
 * If Neon isn't configured, callers degrade gracefully (in-memory limiter,
 * local-only conversations) so the app never runs with no ceiling at all.
 */
let sqlClient: NeonQueryFunction<false, false> | null | undefined;

export function getSql(): NeonQueryFunction<false, false> | null {
  if (sqlClient !== undefined) return sqlClient;
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
  sqlClient = url ? neon(url) : null;
  return sqlClient;
}

/** Runs a parameterized query and returns its rows, or null when Neon isn't configured / the query fails. */
export async function query<T>(
  text: string,
  params: unknown[] = []
): Promise<T[] | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql.query(text, params);
    return rows as T[];
  } catch (err) {
    console.warn("neon query failed:", text.slice(0, 60), err instanceof Error ? err.message : err);
    return null;
  }
}

export interface ChatConversation {
  id: string;
  user_email: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ─── Conversations / messages ────────────────────────────────────────────────

/** Lists a user's conversations, newest activity first. Returns null when the DB isn't configured or fails. */
export async function listConversations(email: string): Promise<ChatConversation[] | null> {
  return query<ChatConversation>(
    `select id, user_email, title, created_at, updated_at
     from chat_conversations
     where user_email = $1
     order by updated_at desc
     limit 50`,
    [email]
  );
}

/** Creates a conversation. Returns null when the DB isn't configured or fails. */
export async function createConversation(email: string, title: string): Promise<ChatConversation | null> {
  const rows = await query<ChatConversation>(
    `insert into chat_conversations (user_email, title)
     values ($1, $2)
     returning id, user_email, title, created_at, updated_at`,
    [email, title]
  );
  return rows?.[0] ?? null;
}

/** Deletes a conversation only if it belongs to the user. */
export async function deleteConversation(id: string, email: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from chat_conversations
     where id = $1 and user_email = $2
     returning id`,
    [id, email]
  );
  return (rows?.length ?? 0) > 0;
}

/** Returns the conversation if it exists and belongs to the user, otherwise null. */
export async function getUserConversation(id: string, email: string): Promise<{ id: string } | null> {
  const rows = await query<{ id: string }>(
    `select id from chat_conversations
     where id = $1 and user_email = $2
     limit 1`,
    [id, email]
  );
  return rows?.[0] ?? null;
}

/** Lists a conversation's messages oldest first. Returns null on failure. */
export async function listMessages(conversationId: string): Promise<ChatMessage[] | null> {
  return query<ChatMessage>(
    `select id, conversation_id, role, content, created_at
     from chat_messages
     where conversation_id = $1
     order by created_at asc`,
    [conversationId]
  );
}

/** Appends one message. Returns false when the DB isn't configured; errors are logged and swallowed. */
export async function insertMessage(conversationId: string, role: "user" | "assistant", content: string): Promise<boolean> {
  const rows = await query(
    `insert into chat_messages (conversation_id, role, content)
     values ($1, $2, $3)`,
    [conversationId, role, content]
  );
  return rows !== null;
}

/** Touches updated_at and optionally renames the conversation. Never throws. */
export async function touchConversation(conversationId: string, title?: string): Promise<void> {
  if (title) {
    await query(
      `update chat_conversations
       set updated_at = $2, title = $3
       where id = $1`,
      [conversationId, new Date().toISOString(), title]
    );
  } else {
    await query(
      `update chat_conversations
       set updated_at = $2
       where id = $1`,
      [conversationId, new Date().toISOString()]
    );
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────

/** Returns the cached JSON value if present and fresh, otherwise null. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const rows = await query<{ data: T }>(
    `select data from api_cache
     where key = $1 and expires_at > now()
     limit 1`,
    [key]
  );
  return rows?.[0]?.data ?? null;
}

/** Upserts a cached value with an absolute expiry. Never throws. */
export async function cacheSet(key: string, value: unknown, expiresAtIso: string): Promise<void> {
  await query(
    `insert into api_cache (key, data, expires_at)
     values ($1, $2::jsonb, $3)
     on conflict (key) do update
     set data = excluded.data, expires_at = excluded.expires_at`,
    [key, JSON.stringify(value), expiresAtIso]
  );
}

/** Runs the table-check query for startup instrumentation. true = fine, false = run the migrations. */
export async function tablesAccessible(): Promise<boolean> {
  const rows = await query<{ id: string }>(`select id from chat_conversations limit 1`);
  return rows !== null;
}

export const MIGRATIONS_HINT = "neon/migrations/20241102_chat_tables.sql";

// ─── Quota (atomic take_slot) ────────────────────────────────────────────────

/**
 * Atomically counts one hit for `key` via the `take_slot()` SQL function and
 * returns true while the count is within `limit`. Returns false only when the
 * server explicitly says the slot is taken; returns null when Neon isn't
 * configured or the call fails (caller should fall back to the local limiter).
 */
export async function takeSlot(key: string, limit: number, ttlSeconds: number): Promise<boolean | null> {
  const rows = await query<{ take_slot: boolean }>(
    `select public.take_slot($1, $2::integer, $3::integer) as take_slot`,
    [key, limit, ttlSeconds]
  );
  const result = rows?.[0]?.take_slot;
  return typeof result === "boolean" ? result : null;
}
