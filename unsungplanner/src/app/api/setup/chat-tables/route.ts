import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

// POST /api/setup/chat-tables — one-time table creation
// Runs DDL directly over the Neon serverless driver as the database owner.
export async function POST() {
  const sql = getSql();

  if (!sql) {
    return NextResponse.json({ error: 'Neon not configured (set NEON_DATABASE_URL)' }, { status: 503 });
  }

  const queries = [
    `CREATE TABLE IF NOT EXISTS chat_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_conv_email ON chat_conversations(user_email)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id)`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const query of queries) {
    try {
      await sql.query(query);
      results.push({ sql: query.slice(0, 60), ok: true });
    } catch (e) {
      results.push({ sql: query.slice(0, 60), ok: false, error: String(e) });
    }
  }

  // Verify the tables are actually usable
  let tablesAccessible = false;
  try {
    await sql`select id from chat_conversations limit 1`;
    tablesAccessible = true;
  } catch (e) {
    results.push({ sql: 'select id from chat_conversations limit 1', ok: false, error: String(e) });
  }

  return NextResponse.json({
    results,
    tablesAccessible,
    note: tablesAccessible
      ? 'Tables are accessible!'
      : 'Tables could not be created. Run neon/migrations/20241102_chat_tables.sql in the Neon SQL Editor.',
  });
}
