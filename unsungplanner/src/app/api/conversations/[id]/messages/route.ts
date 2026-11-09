import { NextRequest, NextResponse } from 'next/server';
import { getSql, getUserConversation, insertMessage, listMessages, touchConversation } from '@/lib/db';

function parseUser(request: NextRequest) {
  const cookie = request.cookies.get('unsung_user');
  if (!cookie?.value) return null;
  try {
    return JSON.parse(decodeURIComponent(cookie.value));
  } catch {
    try { return JSON.parse(cookie.value); } catch { return null; }
  }
}

// GET /api/conversations/[id]/messages — get messages for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = parseUser(request);
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (id.startsWith('local-')) {
    return NextResponse.json({ messages: [] });
  }

  if (!getSql()) return NextResponse.json({ messages: [] });

  // Verify this conversation belongs to this user
  const conv = await getUserConversation(id, user.email);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = await listMessages(id);
  if (data === null) {
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({ messages: data });
}

// POST /api/conversations/[id]/messages — append a message pair (user + assistant)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = parseUser(request);
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (id.startsWith('local-')) {
    return NextResponse.json({ ok: true });
  }

  if (!getSql()) return NextResponse.json({ ok: true });

  try {
    // Verify ownership
    const conv = await getUserConversation(id, user.email);
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { role, content, title } = body as {
      role: 'user' | 'assistant';
      content: string;
      title?: string;
    };

    if (!role || !content) {
      return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
    }

    const inserted = await insertMessage(id, role, content);

    // Update updated_at and optionally title on the conversation
    await touchConversation(id, title);

    if (!inserted) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('messages post error, continuing gracefully', err);
    return NextResponse.json({ ok: true });
  }
}
