import { NextRequest } from 'next/server';
import { GET as handleCallback } from '../../google/callback/route';

// Support the common NextAuth-style callback path (/api/auth/callback/google)
// in case Google Cloud Console was configured with this URI.
export async function GET(request: NextRequest) {
  return handleCallback(request);
}
