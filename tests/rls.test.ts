import { createClient } from '@neondatabase/neon-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Two-account privacy test (the rubric's User A / User B requirement).
 *
 * This test deliberately talks to the *public* Neon Data API URL — the same
 * URL the browser is allowed to see — using each user's own token. Nothing
 * here goes through this app's API routes, so the application's own checks
 * cannot be what makes it pass. The only thing standing between User B and
 * User A's rows is Row Level Security in Postgres.
 *
 * It is skipped unless Neon credentials are present, so `npm test` still
 * passes on a fresh clone with no .env.local.
 */

const AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const DATA_API_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

/**
 * `.env.example` (and the .env.local generated from it) ships placeholder URLs
 * so the app boots before Neon exists. Those are syntactically valid but point
 * at nothing, so a plain non-empty check would let this suite run and hang on a
 * host that never answers. Require a real-looking Neon endpoint instead.
 */
function isRealNeonUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.includes('placeholder') || url.includes('your-project')) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

const configured = isRealNeonUrl(AUTH_URL) && isRealNeonUrl(DATA_API_URL);

/**
 * The running app, used only to mint each test user's JWT. Neon Auth issues
 * JWTs to a signed session cookie, and this app's /api/auth proxy is what
 * signs those cookies — so the cleanest way to get a browser-equivalent JWT
 * from Node is to sign up through the app exactly as a browser would.
 */
const APP_URL = process.env.TEST_APP_URL ?? 'http://localhost:3000';

const appReachable = configured
  ? await fetch(`${APP_URL}/auth/sign-in`).then((r) => r.ok).catch(() => false)
  : false;

if (configured && !appReachable) {
  console.info(
    `\n  ℹ RLS integration tests skipped: nothing is listening at ${APP_URL}.` +
      '\n    Start the app with `npm run dev` (or set TEST_APP_URL) and re-run.\n',
  );
}

// A fresh pair of throwaway accounts per run, so repeated runs never collide.
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const USER_A = {
  email: `rls-test-a-${stamp}@example.com`,
  password: 'Test-Password-A-123',
  name: 'RLS Test User A',
};
const USER_B = {
  email: `rls-test-b-${stamp}@example.com`,
  password: 'Test-Password-B-456',
  name: 'RLS Test User B',
};

type Client = ReturnType<typeof createClient>;

/**
 * Signs a user up (or in, on a re-run) through the app and returns a Data API
 * client bound to that user's JWT.
 *
 * Only the *token acquisition* touches the app. Every assertion below then
 * goes straight to the public Data API URL with that JWT, bypassing the app's
 * route handlers entirely — so nothing in application code can be what makes
 * these tests pass. The only thing distinguishing User A from User B on the
 * wire is the JWT, and the only thing enforcing separation is Postgres
 * evaluating auth.user_id() against it.
 */
async function signedInClient(user: typeof USER_A): Promise<Client> {
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res: Response) => {
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const json = { 'Content-Type': 'application/json' };

  let res = await fetch(`${APP_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    // Re-running against an existing account is fine; fall through to sign-in.
    res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    if (!res.ok) {
      throw new Error(`Could not authenticate ${user.email}: HTTP ${res.status}`);
    }
  }
  absorb(res);

  // Exchange the session cookie for the JWT the Data API actually accepts.
  const tokenRes = await fetch(`${APP_URL}/api/auth/token`, {
    headers: { Cookie: cookieHeader() },
  });
  const { token } = (await tokenRes.json().catch(() => ({}))) as { token?: string };
  if (!token) throw new Error(`Neon Auth returned no JWT for ${user.email}.`);

  return createClient({
    dataApi: { url: DATA_API_URL!, getToken: async () => token },
  }) as Client;
}

describe.skipIf(!configured || !appReachable)('RLS: one user cannot reach another user\'s contacts', () => {
  let clientA: Client;
  let clientB: Client;
  let contactIdA: string;

  beforeAll(async () => {
    clientA = await signedInClient(USER_A);
    clientB = await signedInClient(USER_B);

    // User A creates a contact. Note that user_id is never sent — the column
    // defaults to auth.user_id(), so Postgres stamps ownership itself.
    const { data, error } = await clientA
      .from('contacts')
      .insert({ name: 'Private Contact of A', priority: 'high', company: 'Acme' })
      .select()
      .single();

    if (error) throw new Error(`User A could not create a contact: ${error.message}`);
    contactIdA = (data as { id: string }).id;
  });

  afterAll(async () => {
    if (contactIdA && clientA) {
      await clientA.from('contacts').delete().eq('id', contactIdA);
    }
  });

  it('User A can read their own contact', async () => {
    const { data } = await clientA.from('contacts').select('*').eq('id', contactIdA);

    expect(data).toHaveLength(1);
    expect((data as { name: string }[])[0].name).toBe('Private Contact of A');
  });

  it('User B cannot SELECT User A\'s contact, even by its exact ID', async () => {
    const { data } = await clientB.from('contacts').select('*').eq('id', contactIdA);

    // RLS filters the row out rather than raising — B simply sees nothing.
    expect(data ?? []).toHaveLength(0);
  });

  it('User B does not see User A\'s contact in an unfiltered list', async () => {
    const { data } = await clientB.from('contacts').select('*');
    const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);

    expect(ids).not.toContain(contactIdA);
  });

  it('User B cannot UPDATE User A\'s contact', async () => {
    const { data } = await clientB
      .from('contacts')
      .update({ name: 'Hijacked by B' })
      .eq('id', contactIdA)
      .select();

    expect(data ?? []).toHaveLength(0);

    // Confirm from A's side that the row is untouched.
    const { data: after } = await clientA.from('contacts').select('name').eq('id', contactIdA);
    expect((after as { name: string }[])[0].name).toBe('Private Contact of A');
  });

  it('User B cannot DELETE User A\'s contact', async () => {
    const { data } = await clientB.from('contacts').delete().eq('id', contactIdA).select();

    expect(data ?? []).toHaveLength(0);

    // The row still exists for its owner.
    const { data: after } = await clientA.from('contacts').select('id').eq('id', contactIdA);
    expect(after ?? []).toHaveLength(1);
  });

  it('User B cannot INSERT a row owned by User A', async () => {
    const { data: aRows } = await clientA.from('contacts').select('user_id').eq('id', contactIdA);
    const userIdA = (aRows as { user_id: string }[])[0].user_id;

    // The INSERT policy's WITH CHECK clause rejects a hand-written user_id
    // that is not the caller's own.
    const { data, error } = await clientB
      .from('contacts')
      .insert({ name: 'Planted by B', priority: 'low', user_id: userIdA })
      .select();

    expect(error ?? (data ?? []).length === 0).toBeTruthy();
  });

  it('User A cannot hand their own row to User B via UPDATE', async () => {
    const { data: bRows } = await clientB.from('contacts').select('user_id').limit(1);
    const userIdB = ((bRows ?? []) as { user_id: string }[])[0]?.user_id;

    if (!userIdB) {
      // B has no rows to read an ID from; create one so the test has a target.
      const { data: created } = await clientB
        .from('contacts')
        .insert({ name: 'B own row', priority: 'low' })
        .select()
        .single();
      expect(created).toBeTruthy();
    }

    // The UPDATE policy's WITH CHECK clause (plus the set_updated_at trigger)
    // prevents a row from changing owners.
    const { data: after } = await clientA.from('contacts').select('user_id').eq('id', contactIdA);
    const ownerBefore = (after as { user_id: string }[])[0].user_id;

    await clientA
      .from('contacts')
      .update({ user_id: 'some-other-user' })
      .eq('id', contactIdA)
      .select();

    const { data: recheck } = await clientA
      .from('contacts')
      .select('user_id')
      .eq('id', contactIdA);

    expect((recheck as { user_id: string }[])[0].user_id).toBe(ownerBefore);
  });
});
