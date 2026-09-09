import { createNeonAuth } from '@neondatabase/neon-js/auth/next/server';

/**
 * Server-side Neon Auth (Managed Better Auth).
 *
 * Both values below are server-only and must never reach the browser:
 *   NEON_AUTH_BASE_URL       - the Neon Auth instance this app proxies to
 *   NEON_AUTH_COOKIE_SECRET  - signs the session cookie (min. 32 characters)
 *
 * The browser never talks to Neon Auth directly. It calls this app's
 * /api/auth/[...path] route, which proxies to Neon Auth and sets an httpOnly,
 * signed session cookie, keeping the session token out of JavaScript's reach.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env.local and fill it in — see the README.',
    );
  }
  return value;
}

type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

let instance: NeonAuthInstance | null = null;

/**
 * Built on first use rather than at import time, so `next build` succeeds on a
 * clean clone with no .env.local. A missing variable then surfaces as a clear
 * error on the first request instead of an opaque build failure.
 */
function getAuth(): NeonAuthInstance {
  if (!instance) {
    instance = createNeonAuth({
      baseUrl: required('NEON_AUTH_BASE_URL'),
      cookies: {
        secret: required('NEON_AUTH_COOKIE_SECRET'),
        sessionDataTtl: 300,
      },
    });
  }
  return instance;
}

/** Route handlers for /api/auth/[...path], resolved per request. */
export function authRouteHandlers() {
  type Handlers = ReturnType<NeonAuthInstance['handler']>;
  type Ctx = Parameters<Handlers['GET']>[1];

  const call = (method: keyof Handlers) => (request: Request, context: Ctx) =>
    getAuth().handler()[method](request, context);

  return {
    GET: call('GET'),
    POST: call('POST'),
    PUT: call('PUT'),
    DELETE: call('DELETE'),
    PATCH: call('PATCH'),
  };
}

/** Middleware for protecting app routes, resolved per request. */
export function authMiddleware(config?: { loginUrl?: string }) {
  return (...args: Parameters<ReturnType<NeonAuthInstance['middleware']>>) =>
    getAuth().middleware(config)(...args);
}

/**
 * The JWT the Neon Data API expects, which is the Better Auth *session* token
 * (`session.token`) — not `getAccessToken()`, which is Better Auth's method for
 * OAuth provider tokens and requires a providerId. This mirrors what neon-js
 * does internally in its browser client.
 *
 * The server's getSession() can answer from a signed cookie cache that omits
 * the token, so fall back to a cache-bypassing call when it is not present.
 */
export async function getDataApiToken(): Promise<string> {
  // The session cookie holds an opaque 32-character session token, which the
  // Data API rejects ("not a valid JWT encoding"). The `token` endpoint
  // exchanges the current session for a signed JWT whose subject claim is what
  // Postgres reads via auth.user_id().
  const { data, error } = await getAuth().token();
  if (error) {
    throw new Error(`Could not obtain a Neon Auth JWT: ${error.message}`);
  }

  const jwt = (data as { token?: string } | null | undefined)?.token;
  if (!jwt) {
    throw new Error('Neon Auth returned no JWT for the current session.');
  }
  return jwt;
}

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

/**
 * Returns the signed-in user, or null. Every API route calls this first and
 * refuses to do any work without it.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const { data } = await getAuth().getSession();
    const user = data?.user;
    if (!user?.id) return null;
    return { id: user.id, email: user.email, name: user.name };
  } catch {
    return null;
  }
}
