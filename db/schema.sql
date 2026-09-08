-- ============================================================================
-- Secure Networking Tracker — database schema
-- Run against your Neon project:  psql "$NEON_DATABASE_URL" -f db/schema.sql
--
-- Security model
-- --------------
-- Every row in public.contacts is owned by exactly one authenticated user.
-- Ownership is carried by contacts.user_id, a TEXT column that defaults to
-- auth.user_id() -- the subject claim of the Neon Auth JWT presented on the
-- request. Row Level Security is enabled and FORCED, and four separate
-- policies (select / insert / update / delete) each restrict access to rows
-- where auth.user_id() = user_id.
--
-- Because enforcement lives in the database rather than the application, the
-- public Neon Data API URL can be exposed to the browser safely: a request
-- carrying User A's token can only ever see or modify User A's rows, no
-- matter what query is sent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id           uuid        primary key default gen_random_uuid(),

  -- Ownership column. Defaults to the signed-in user's ID so a client never
  -- has to send it, and NOT NULL so a row can never become orphaned/public.
  user_id      text        not null default auth.user_id(),

  name         text        not null,
  company      text,
  role         text,
  where_met    text,
  notes        text,
  priority     text        not null default 'medium',

  -- Sorting by `priority` alphabetically would give high, low, medium. This
  -- stored generated column gives the Data API a column it can ORDER BY to
  -- get the meaningful order instead.
  priority_rank int generated always as (
    case priority when 'high' then 0 when 'medium' then 1 else 2 end
  ) stored,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Database-level validation. This is the last line of defence: it holds even
  -- if a request bypasses the application's Zod validation and talks to the
  -- Data API directly.
  constraint contacts_name_not_blank check (length(btrim(name)) > 0),
  constraint contacts_name_max_len   check (length(name) <= 200),
  constraint contacts_priority_valid check (priority in ('high', 'medium', 'low'))
);

comment on column public.contacts.user_id is
  'Owner of the row. Defaults to auth.user_id() from the Neon Auth JWT; every RLS policy keys off this column.';

-- Sorting and filtering are always scoped to one user, so lead with user_id.
create index if not exists contacts_user_id_created_at_idx
  on public.contacts (user_id, created_at desc);

create index if not exists contacts_user_id_priority_idx
  on public.contacts (user_id, priority_rank);

-- ----------------------------------------------------------------------------
-- Keep updated_at honest
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- A row must never change hands via UPDATE. The RLS WITH CHECK below already
  -- rejects this, but pinning the value here means even a future policy
  -- mistake cannot silently transfer ownership.
  new.user_id = old.user_id;
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.contacts enable row level security;

-- FORCE applies RLS to the table owner too, so nothing routine bypasses it.
alter table public.contacts force row level security;

drop policy if exists contacts_select_own on public.contacts;
drop policy if exists contacts_insert_own on public.contacts;
drop policy if exists contacts_update_own on public.contacts;
drop policy if exists contacts_delete_own on public.contacts;

-- SELECT: you may read only rows you own.
create policy contacts_select_own
  on public.contacts
  for select
  to authenticated
  using (auth.user_id() = user_id);

-- INSERT: the row you create must be stamped with your own ID. WITH CHECK
-- blocks a client that tries to hand-write someone else's user_id.
create policy contacts_insert_own
  on public.contacts
  for insert
  to authenticated
  with check (auth.user_id() = user_id);

-- UPDATE: USING decides which rows you may target; WITH CHECK decides what
-- they may look like afterwards. Both are required -- USING alone would let a
-- user edit their own row and reassign it to another user on the way out.
create policy contacts_update_own
  on public.contacts
  for update
  to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- DELETE: you may delete only rows you own.
create policy contacts_delete_own
  on public.contacts
  for delete
  to authenticated
  using (auth.user_id() = user_id);

-- ----------------------------------------------------------------------------
-- Grants for the Data API (PostgREST) roles
-- ----------------------------------------------------------------------------
-- Table privileges say "this role may attempt these verbs"; RLS then decides
-- which rows. Anonymous users are granted nothing at all.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;

revoke all on public.contacts from anonymous;
