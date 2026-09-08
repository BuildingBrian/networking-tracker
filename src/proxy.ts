import { authMiddleware } from '@/lib/auth/server';

/**
 * Protects the app routes. An unauthenticated request to /contacts is
 * redirected to the sign-in page before any page code runs.
 *
 * This is a convenience layer, not the security boundary — the real boundary
 * is RLS in Postgres, which holds even if a request never passes through here.
 *
 * (Next.js 16 renamed the `middleware` file convention to `proxy`.)
 */
export default authMiddleware({ loginUrl: '/auth/sign-in' });

export const config = {
  matcher: ['/contacts/:path*'],
};
