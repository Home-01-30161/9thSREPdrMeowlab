import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const userCookie = request.cookies.get('unsung_user');

  if (!userCookie || !userCookie.value) {
    return NextResponse.json({ user: null });
  }

  try {
    const user = JSON.parse(userCookie.value);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
