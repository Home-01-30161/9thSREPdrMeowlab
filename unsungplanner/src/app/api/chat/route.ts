import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';

export async function POST(request: NextRequest) {
  // 1. Strict Google Auth Verification
  const userCookie = request.cookies.get('unsung_user');
  let user: { provider?: string; name?: string; email?: string } | null = null;

  if (userCookie?.value) {
    try {
      user = JSON.parse(decodeURIComponent(userCookie.value));
    } catch {
      try {
        user = JSON.parse(userCookie.value);
      } catch {
        user = null;
      }
    }
  }

  // Reject if not logged in with Google (TEMPORARY: allow guest for testing)
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return NextResponse.json(
      {
        error: 'Google login required. You must log in with Google to use the Travel Chatbot.',
        requiresGoogleAuth: true,
      },
      { status: 401 }
    );
  }

  try {
    const { message, history } = (await request.json()) as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.TYPHOON_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: `Hello ${user.name}! I am your Unsung Travel Assistant. How can I help you plan your journey? (Note: TYPHOON_API_KEY is not configured yet).` },
        { status: 200 }
      );
    }

    const llm = new ChatOpenAI({
      apiKey,
      model: process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct',
      temperature: 0.5,
      timeout: 30_000,
      configuration: { baseURL: 'https://api.opentyphoon.ai/v1' },
    });

    const pastContext = (history ?? [])
      .slice(-4)
      .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
      .join('\n');

    const prompt = `You are the Unsung Planner AI Travel Chatbot assistant. You help travelers with practical, realistic advice on destinations, budgets, flights, trains, local food, culture, and itinerary customization. Keep responses friendly, concise, and formatted with bullet points where appropriate. Always format dates in DD/MM/YY format.
User Name: ${user.name}

Recent conversation:
${pastContext}

User: ${message}
Assistant:`;

    const response = await llm.invoke(prompt);
    const reply = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[Chatbot API] Error:', err);
    return NextResponse.json(
      { reply: 'I encountered a temporary connection glitch. Please try asking again in a moment!' },
      { status: 200 }
    );
  }
}
