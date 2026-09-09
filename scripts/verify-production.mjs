/**
 * End-to-end verification of a running instance through its public HTTP surface.
 *
 *   npm run verify                                    # http://localhost:3000
 *   BASE_URL=https://<app>.vercel.app npm run verify  # production
 *
 * Creates one throwaway account and walks the whole contract the README claims:
 * unauthenticated requests are refused, invalid input fails with field errors,
 * create / edit / filter / delete work, a client cannot reassign ownership, and
 * signing out locks the API again. Exits non-zero if any check fails.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const absorb = (res) => {
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const eq = pair.indexOf('=');
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
};

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

async function api(path, { method = 'GET', body, redirect = 'follow' } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect,
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  absorb(res);
  let json = null;
  try { json = await res.clone().json(); } catch { /* not JSON */ }
  return { res, json };
}

console.log(`Verifying ${BASE}\n`);

try {
  await fetch(BASE + '/auth/sign-in');
} catch (error) {
  console.error(`Cannot reach ${BASE}: ${error.message}`);
  process.exit(2);
}

// --- Unauthenticated surface --------------------------------------------------
{
  const res = await fetch(BASE + '/auth/sign-in');
  const html = await res.text();
  check('sign-in page renders', res.status === 200 && html.includes('Welcome back'), `HTTP ${res.status}`);
}
{
  const { res } = await api('/api/contacts');
  check('GET /api/contacts without a session → 401', res.status === 401, `HTTP ${res.status}`);
}
{
  const res = await fetch(BASE + '/contacts', { redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  check('/contacts without a session redirects to sign-in', [302, 307].includes(res.status) && loc.includes('/auth/sign-in'), `HTTP ${res.status} → ${loc || '(none)'}`);
}

// --- Sign up ------------------------------------------------------------------
const user = {
  email: `verify-${Date.now()}@example.com`,
  password: 'Verify-Password-123',
  name: 'Verify User',
};
{
  const { res } = await api('/api/auth/sign-up/email', { method: 'POST', body: user });
  check('sign-up succeeds and sets a session cookie', res.status === 200 && [...jar.keys()].some((k) => k.includes('session')), `HTTP ${res.status}, cookies: ${[...jar.keys()].length}`);
}
{
  const { res, json } = await api('/api/contacts');
  check('new account starts with an empty list', res.status === 200 && Array.isArray(json?.contacts) && json.contacts.length === 0, `HTTP ${res.status}, ${json?.contacts?.length ?? '?'} contacts`);
}

// --- Validation ---------------------------------------------------------------
{
  const { res, json } = await api('/api/contacts', { method: 'POST', body: { name: '   ', priority: 'urgent' } });
  check('blank name + invalid priority → 400 with per-field errors', res.status === 400 && json?.fieldErrors?.name && json?.fieldErrors?.priority, `HTTP ${res.status}: ${json?.error ?? ''}`);
}

// --- Create / edit / filter / delete -----------------------------------------
let id = null;
{
  const { res, json } = await api('/api/contacts', {
    method: 'POST',
    body: { name: 'Verify Contact', company: 'Acme', role: 'PM', where_met: 'Test', notes: 'n', priority: 'high' },
  });
  id = json?.contact?.id ?? null;
  check('create → 201 with user_id stamped by the database', res.status === 201 && id && json.contact.user_id, `HTTP ${res.status}, id ${id ?? '?'}`);
}
let ownerId = null;
{
  const { json } = await api('/api/contacts');
  ownerId = json?.contacts?.[0]?.user_id ?? null;
  check('created contact appears in the list', json?.contacts?.length === 1, `${json?.contacts?.length ?? '?'} contacts`);
}
{
  const { res, json } = await api(`/api/contacts/${id}`, { method: 'PATCH', body: { priority: 'low', notes: 'edited' } });
  check('edit → 200 and the change is applied', res.status === 200 && json?.contact?.priority === 'low' && json?.contact?.notes === 'edited', `HTTP ${res.status}`);
}
{
  const { res, json } = await api(`/api/contacts/${id}`, { method: 'PATCH', body: { user_id: 'someone-else', name: 'Still mine' } });
  check('attempt to reassign user_id is ignored; row stays owned by caller', res.status === 200 && json?.contact?.user_id === ownerId && json?.contact?.name === 'Still mine', `user_id ${json?.contact?.user_id === ownerId ? 'unchanged' : 'CHANGED'}`);
}
{
  const low = await api('/api/contacts?priority=low');
  const high = await api('/api/contacts?priority=high');
  check('priority filter works (low → 1, high → 0)', low.json?.contacts?.length === 1 && high.json?.contacts?.length === 0, `low ${low.json?.contacts?.length}, high ${high.json?.contacts?.length}`);
}
{
  const { res } = await api(`/api/contacts/${id}`, { method: 'DELETE' });
  check('delete → 200', res.status === 200, `HTTP ${res.status}`);
}
{
  const { res } = await api(`/api/contacts/${id}`, { method: 'DELETE' });
  check('deleting it again → 404', res.status === 404, `HTTP ${res.status}`);
}
{
  const { json } = await api('/api/contacts');
  check('list is empty again', json?.contacts?.length === 0, `${json?.contacts?.length ?? '?'} contacts`);
}

// --- Sign out -----------------------------------------------------------------
{
  const { res } = await api('/api/auth/sign-out', { method: 'POST', body: {} });
  check('sign-out → 200', res.status === 200, `HTTP ${res.status}`);
}
{
  const { res } = await api('/api/contacts');
  check('API refuses the request after sign-out → 401', res.status === 401, `HTTP ${res.status}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
