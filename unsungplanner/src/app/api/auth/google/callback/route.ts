import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = request.nextUrl.origin;
  const loginUrl = new URL('/login', request.url);

  if (error || !code) {
    loginUrl.searchParams.set('error', error || 'access_denied');
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    loginUrl.searchParams.set('error', 'missing_credentials');
    return NextResponse.redirect(loginUrl);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  let originUrl = appUrl ? appUrl.replace(/\/$/, '') : origin;
  if (originUrl.includes('127.0.0.1')) {
    originUrl = originUrl.replace('127.0.0.1', 'localhost');
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${originUrl}${request.nextUrl.pathname}`;

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google OAuth] Token exchange error:', errText);
      loginUrl.searchParams.set('error', 'token_exchange_failed');
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google UserInfo endpoint
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      loginUrl.searchParams.set('error', 'user_info_failed');
      return NextResponse.redirect(loginUrl);
    }

    const userData = await userRes.json();
    const userProfile = {
      id: userData.id,
      email: userData.email,
      name: userData.name || userData.email.split('@')[0],
      picture: userData.picture || '',
      provider: 'google',
      loggedInAt: new Date().toISOString(),
    };

    // 3. Set session cookie and redirect to Home
    const homeUrl = new URL('/', request.url);
    homeUrl.searchParams.set('auth', 'success');

    const response = NextResponse.redirect(homeUrl);

    // Save session in cookie
    response.cookies.set('unsung_user', JSON.stringify(userProfile), {
      httpOnly: false, // Accessible to client component for UI display
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    // Clear state
    response.cookies.delete('oauth_state');

    return response;
  } catch (err) {
    console.error('[Google OAuth] Callback exception:', err);
    loginUrl.searchParams.set('error', 'oauth_exception');
    return NextResponse.redirect(loginUrl);
  }
}
