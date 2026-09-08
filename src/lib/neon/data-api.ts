import 'server-only';

import { createClient } from '@neondatabase/neon-js';

import { getDataApiToken } from '@/lib/auth/server';

/**
 * Builds a Neon Data API (PostgREST) client bound to the *current request's*
 * signed-in user.
 *
 * The user's Neon Auth JWT is attached to every Data API call, so Postgres
 * evaluates `auth.user_id()` as that user and the RLS policies in
 * db/schema.sql decide which rows the query can touch. The server never uses a
 * privileged connection for user data — it acts strictly as that user.
 *
 * This is why no DATABASE_URL appears anywhere in the request path: reads and
 * writes go over the Data API under the user's own identity.
 */
export function createUserDataClient() {
  const url = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_NEON_DATA_API_URL. Copy .env.example to .env.local — see the README.',
    );
  }

  return createClient({
    dataApi: {
      url,
      getToken: getDataApiToken,
    },
  });
}
