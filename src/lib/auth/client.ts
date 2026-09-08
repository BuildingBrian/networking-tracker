'use client';

import { createAuthClient } from '@neondatabase/neon-js/auth/next';

/**
 * Browser-side auth client. It posts to this app's own /api/auth/[...path]
 * route rather than to Neon Auth directly, so no Neon credential is needed
 * here and the session lives in an httpOnly cookie.
 */
export const authClient = createAuthClient();
