import { NextRequest, NextResponse } from 'next/server';
import { createConversation, deleteConversation, getSql, listConversations } from '@/lib/db';

function parseUser(request: NextRequest) {
  const cookie = request.cookies.get('unsung_user');
  if (!cookie?.value) return null;
  try {
    return JSON.parse(decodeURIComponent(cookie.value));
  } catch {
    try { return JSON.parse(cookie.value); } catch { return null; }
  }
}

// GET /api/conversations — list all conversations for current user
export async function GET(request: NextRequest) {
  const user = parseUser(request);
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!getSql()) {
    return NextResponse.json({ conversations: [] });
  }

  const data = await listConversations(user.email);
  if (data === null) {
    return NextResponse.json({ conversations: [] });
  }

  return NextResponse.json({ conversations: data });
}

// POST /api/conversations — create a new conversation
export async function POST(request: NextRequest) {
  const user = parseUser(request);
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!getSql()) {
    return NextResponse.json({
      conversation: {
        id: `local-${Date.now()}`,
        title: 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    });
  }

  const body = await request.json().catch(() => ({}));
  const title = (body as { title?: string }).title || 'New Chat';

  const data = await createConversation(user.email, title);
  if (!data) {
    return NextResponse.json({
      conversation: {
        id: `local-${Date.now()}`,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ conversation: data });
}

// DELETE /api/conversations?id=xxx — delete a conversation
export async function DELETE(request: NextRequest) {
  const user = parseUser(request);
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  if (!getSql()) return NextResponse.json({ ok: true });

  const ok = await deleteConversation(id, user.email);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
