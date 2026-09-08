import { authRouteHandlers } from '@/lib/auth/server';

/**
 * Proxies every Neon Auth call (sign-up, sign-in, sign-out, session, token)
 * through this app so the session lands in an httpOnly, signed cookie instead
 * of in browser-readable storage.
 */
export const { GET, POST, PUT, DELETE, PATCH } = authRouteHandlers();
