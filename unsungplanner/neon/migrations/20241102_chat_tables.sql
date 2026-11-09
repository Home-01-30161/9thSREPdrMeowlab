-- Migration: Create chat conversations and messages tables for Unsung Planner
-- Run this in the Neon SQL Console (console.neon.tech) — or let the app do it
-- automatically at startup / via POST /api/setup/chat-tables.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_chat_conv_email ON chat_conversations(user_email);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id);

-- RLS: The app only talks to the database from the server using the
-- NEON_DATABASE_URL connection string, which runs as the database owner
-- (owner queries bypass RLS), so no policies are needed.
