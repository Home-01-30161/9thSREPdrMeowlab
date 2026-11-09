import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('unsung_user');
  return response;
}

export async function GET(request: NextRequest) {
  const homeUrl = new URL('/', request.url);
  const response = NextResponse.redirect(homeUrl);
  response.cookies.delete('unsung_user');
  return response;
}
