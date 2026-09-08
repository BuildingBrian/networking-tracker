# Networking Tracker

A private, per-user networking tracker for the people you want to stay connected with at Berkeley. Sign up, add the people you meet — name, company, role, where you met, notes, and a priority — then sort, filter, edit, and delete them. Every contact belongs to exactly one account, and that ownership is enforced by Row Level Security inside Postgres rather than by application code, so the data stays private even against a request made directly to the public Data API.

**Live app:** <!-- LIVE_URL --> _(pending deployment — see “Deployment”)_

---

## Table of contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Technology stack](#technology-stack-and-why)
- [Architecture](#architecture)
- [Request flow](#request-flow)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [Tests](#tests)
- [Grading evidence](#grading-evidence)
- [Deployment](#deployment)
- [Known limitations](#known-limitations-and-what-id-improve-next)

---

## Screenshots

Regenerate these at any time against a running instance:

```bash
npm run screenshots                        # against http://localhost:3000
BASE_URL=https://your-app.vercel.app npm run screenshots
```

`scripts/screenshots.mjs` drives the local Google Chrome with Playwright, creates a throwaway account, and walks the whole lifecycle — sign-up, empty state, adding contacts, an invalid submission, filtering, editing, a page refresh, and the mobile layout.

### Sign in

![Sign-in screen](docs/01-sign-in.png)

### Sign up

![Sign-up screen with details filled in](docs/02-sign-up-filled.png)

<!-- SCREENSHOTS -->
_The remaining screenshots — contact list, invalid input rejected, filtering, editing, persistence after refresh, and the mobile layout — are captured by the same command once the app is connected to Neon._

---

## Features

- **Email + password sign-up, sign-in, and sign-out** via Neon Managed Better Auth.
- **A private contact list per account.** You only ever see your own rows.
- **Create, view, edit, and delete** contacts, with name, company, role, where you met, notes, and priority.
- **Priority is constrained to `high` / `medium` / `low`** in three places: the UI `<Select>`, the server-side Zod schema, and a Postgres `CHECK` constraint.
- **Sort** by date added, name, company, or priority, ascending or descending. Priority sorts in meaningful order (high → medium → low), not alphabetically.
- **Filter** by priority and **search** across name, company, role, and where you met.
- **Understandable loading, empty, success, and error states**, including a distinct empty state for “no contacts yet” versus “no contacts match these filters”.
- **Responsive**: a table on desktop, stacked cards on mobile, with controls that reflow to a single column on small screens.
- **Data survives refresh** because it lives in Neon Postgres, not in browser state.

---

## Technology stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router) + TypeScript** | Lets the frontend and backend live in one repo while staying genuinely separate — React components in the browser, Route Handlers on the server. It is also the deployment target Vercel is built around. |
| Styling | **Tailwind CSS v4 + shadcn/ui** | shadcn/ui is a real component system (Radix primitives + consistent design tokens) rather than hand-rolled CSS, which keeps the UI accessible and consistent across breakpoints without much custom code. |
| Database | **Neon Postgres** | Serverless Postgres, and the assignment's target. More importantly, it supports RLS, which is where this app's security actually lives. |
| Auth | **Neon Managed Better Auth** | Issues a JWT whose subject Postgres reads as `auth.user_id()`, which is what makes database-level ownership possible without the app passing a user ID around. |
| Data access | **Neon Data API (PostgREST) via `@neondatabase/neon-js`** | Requests carry the user's own token, so RLS evaluates on every query. The app never holds a privileged database connection for user data. |
| Validation | **Zod** | One schema shared by the API routes and the test suite, so the tests exercise exactly the code the server runs. |
| Tests | **Vitest** | Fast, TypeScript-native, and runs both the pure validation tests and the live two-user RLS test from the same command. |
| Hosting | **Vercel** | First-class Next.js support and simple production environment variables. |

---

## Architecture

```
Browser (React client components)
  │
  │  fetch('/api/contacts')            ← never talks to Postgres directly
  ▼
Next.js Route Handlers  (src/app/api/contacts/…)
  │  1. getSessionUser()   → 401 if not signed in
  │  2. Zod validation     → 400 with per-field messages
  │  3. Data API call carrying THE USER'S OWN token
  ▼
Neon Data API (PostgREST)
  │
  ▼
Neon Postgres — Row Level Security decides which rows the query may touch
```

**Frontend** — `src/components/*` are client components. They hold UI state (filters, sort, dialog open/closed) and talk only to this app's own `/api` routes. They never see a database credential.

**Backend** — `src/app/api/contacts/route.ts` and `src/app/api/contacts/[id]/route.ts` are the server. Each handler authenticates the session, validates the body against a Zod schema, and only then issues a Data API query. `src/app/api/auth/[...path]/route.ts` proxies Neon Auth so the session lands in an **httpOnly, signed cookie** rather than in browser-readable storage.

**Database** — `db/schema.sql` defines the `contacts` table, its `CHECK` constraints, and four RLS policies.

**Authentication** — Neon Managed Better Auth. The server never sends its own privileged identity to the Data API; it forwards the signed-in user's JWT, so Postgres always evaluates policies as that user.

**Hosting** — Vercel. Server-only variables are set as Vercel environment variables and are never bundled into client JavaScript.

### Two layers of defence, on purpose

Validation exists in the **server** (Zod, with clear per-field messages) *and* in the **database** (`CHECK` constraints). Ownership is enforced **only** in the database, by RLS — the app deliberately does not add `WHERE user_id = me` to its queries, because doing so would hide whether RLS actually works. The tests exploit exactly that: the two-user test bypasses this app entirely and hits the public Data API directly.

---

## Request flow

Adding a contact, end to end:

1. The user submits the dialog form. The client `POST`s JSON to `/api/contacts`.
2. The handler calls `getSessionUser()`. No session → `401` and nothing else happens.
3. The body is parsed with `contactInputSchema`. A blank name or a priority outside `high|medium|low` → `400` with `{ error, fieldErrors }`, which the form renders under the offending input.
4. The handler builds a Data API client whose `getToken` returns **this request's** Neon Auth session JWT.
5. `insert()` is sent **without** a `user_id`. Postgres fills it from `DEFAULT auth.user_id()`, and the `contacts_insert_own` policy's `WITH CHECK` clause confirms the row being created belongs to the caller.
6. The new row comes back and the list refetches.

Reading, updating, and deleting follow the same path. Notably, `PATCH /api/contacts/:id` filters on `id` alone — no `user_id` — because the `contacts_update_own` policy already restricts which rows are visible to the statement. Aiming it at another user's contact matches zero rows and returns `404`.

---

## Local setup

```bash
git clone https://github.com/BuildingBrian/networking-tracker.git
cd networking-tracker
npm install
```

Create the Neon project:

1. In the [Neon Console](https://console.neon.tech), create a project.
2. Enable **Auth** (Managed Better Auth) and copy the Auth URL.
3. Enable the **Data API** on the database and copy the Data API URL.
4. Copy the Postgres connection string from **Connection Details**.

Configure the environment:

```bash
cp .env.example .env.local
# then fill in .env.local with the values above
openssl rand -base64 32   # use the output for NEON_AUTH_COOKIE_SECRET
```

Apply the schema and RLS policies:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Run it:

```bash
npm run dev
# http://localhost:3000
```

Other commands:

```bash
npm test         # automated tests
npm run build    # production build
npm run lint     # eslint
npm run typecheck
```

---

## Environment variables

Copy `.env.example` to `.env.local`. `.env.local` is git-ignored; `.env.example` contains placeholders only.

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_NEON_AUTH_URL` | Public | Neon Auth HTTPS endpoint. Safe to expose — RLS, not URL secrecy, protects the data. |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | Public | Neon Data API HTTPS endpoint. Same reasoning. |
| `NEON_AUTH_BASE_URL` | **Server only** | The Neon Auth instance the `/api/auth` route proxies to. |
| `NEON_AUTH_COOKIE_SECRET` | **Server only** | Signs the httpOnly session cookie. Minimum 32 characters. |
| `DATABASE_URL` | **Server only** | Used *only* to apply `db/schema.sql` from your machine. The running app never reads it. |

The Postgres connection string is never sent to the browser, never referenced by client code, and never committed. The application reaches the database exclusively through the Data API using the signed-in user's token.

---

## Database schema

`public.contacts` — see [`db/schema.sql`](db/schema.sql) for the authoritative definition.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `default gen_random_uuid()`. |
| `user_id` | `text` | **`not null default auth.user_id()`** — the owner. Every RLS policy keys off this column. |
| `name` | `text` | `not null`; `CHECK (length(btrim(name)) > 0)` and `length(name) <= 200`. |
| `company` | `text` | Nullable. |
| `role` | `text` | Nullable. |
| `where_met` | `text` | Nullable. |
| `notes` | `text` | Nullable. |
| `priority` | `text` | `not null default 'medium'`; `CHECK (priority in ('high','medium','low'))`. |
| `priority_rank` | `int` | Generated (`high`→0, `medium`→1, `low`→2) so sorting by priority is meaningful rather than alphabetical. |
| `created_at` | `timestamptz` | `not null default now()`. |
| `updated_at` | `timestamptz` | `not null default now()`, maintained by a `BEFORE UPDATE` trigger. |

Indexes: `(user_id, created_at desc)` and `(user_id, priority_rank)` — every query is scoped to one user, so `user_id` leads.

---

## Authentication and RLS ownership

When a user signs in, Neon Auth issues a JWT. Every Data API request carries that JWT, and Postgres exposes its subject as **`auth.user_id()`**. `contacts.user_id` defaults to that value, so the database — not the application — decides who owns a row.

RLS is **enabled and forced** on `contacts` (forced so it applies to the table owner too), with four separate policies:

```sql
create policy contacts_select_own on public.contacts
  for select to authenticated
  using (auth.user_id() = user_id);

create policy contacts_insert_own on public.contacts
  for insert to authenticated
  with check (auth.user_id() = user_id);

create policy contacts_update_own on public.contacts
  for update to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

create policy contacts_delete_own on public.contacts
  for delete to authenticated
  using (auth.user_id() = user_id);
```

**The ownership rule in one sentence:** a row is reachable only when `auth.user_id() = user_id`.

**Why `UPDATE` needs both clauses.** `USING` decides which rows a statement may *target*; `WITH CHECK` decides what those rows may look like *afterwards*. With `USING` alone, a user could edit a row they own and reassign `user_id` to someone else on the way out — handing their row to another account. `WITH CHECK` rejects any result that would no longer belong to the caller. A `BEFORE UPDATE` trigger additionally pins `user_id` to its previous value, so even a future policy mistake could not silently transfer ownership.

The `anonymous` role is granted nothing on this table, so an unauthenticated request to the public Data API cannot read a single row.

---

## Tests

```bash
npm test
```

Two suites:

**1. `tests/validation.test.ts` — 18 tests, no credentials required.** Runs against the same Zod schema the API routes use, so a pass here means the server rejects the same input the same way. Covers: empty names, whitespace-only names, missing names, over-length names, whitespace trimming, each valid priority, invalid priorities (`urgent`, `HIGH`), missing priorities, blank optional fields normalising to `null`, partial updates, and the error shape the API returns.

**2. `tests/rls.test.ts` — 7 tests, the two-account privacy proof.** Skipped automatically when Neon credentials are absent, so `npm test` passes on a fresh clone. When configured it creates two throwaway accounts and asserts, **against the public Data API directly rather than through this app**, that:

- User A can read their own contact.
- User B cannot `SELECT` User A's contact, even by its exact ID.
- User A's contact does not appear in User B's unfiltered list.
- User B cannot `UPDATE` it — and A's copy is verified unchanged afterwards.
- User B cannot `DELETE` it — and the row still exists for A afterwards.
- User B cannot `INSERT` a row stamped with User A's `user_id`.
- User A cannot hand their own row to another user via `UPDATE`.

Because this suite talks to the public endpoint with each user's own token, nothing in the application's code can be what makes it pass. Only RLS can.

### Test output

<!-- TEST_OUTPUT -->

---

## Grading evidence

<!-- EVIDENCE -->
_Pending — added once the app is deployed._

---

## Deployment

<!-- DEPLOYMENT -->

1. Push the repository to GitHub.
2. Import it into Vercel (or run `vercel --prod`).
3. Add the production environment variables in **Vercel → Settings → Environment Variables**: `NEXT_PUBLIC_NEON_AUTH_URL`, `NEXT_PUBLIC_NEON_DATA_API_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. `DATABASE_URL` is **not** needed in Vercel — the running app never uses it.
4. Add the deployed Vercel domain to **Neon Auth → Trusted origins**, then confirm sign-in works there.
5. Open the public URL in a private window and run the Definition of Done checks.

---

## Known limitations and what I'd improve next

- **Email verification is off.** Sign-up accepts any syntactically valid address. For anything real, Neon Auth's email verification should be switched on.
- **Delete uses `window.confirm`.** It works and is accessible, but a shadcn `AlertDialog` would match the rest of the UI.
- **Search is a `LIKE` scan.** Fine at the scale one person's network reaches; a `pg_trgm` index or a `tsvector` column would be the fix if it ever got large.
- **No pagination.** The list fetches every contact the user owns. Cursor pagination on `(created_at, id)` would be the natural next step.
- **`@neondatabase/neon-js` is a beta SDK** (0.7.0-beta). The Data API token is read from the Better Auth *session* token, which is what the SDK does internally; that detail could change between beta releases.
- **No optimistic UI.** Every mutation refetches the list. Fine at this size, but optimistic updates would make it feel faster.
- **Tests cover validation and RLS, not the UI.** Playwright tests for the sign-in → add → edit → delete path would be the highest-value addition.
