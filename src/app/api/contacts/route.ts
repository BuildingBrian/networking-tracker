import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/server';
import { createUserDataClient } from '@/lib/neon/data-api';
import { SORT_FIELDS, type SortField } from '@/lib/types';
import { PRIORITIES, contactInputSchema, validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts
 *
 * Query params: sort, dir, priority, q
 *
 * No user_id filter is applied here on purpose — RLS already restricts the
 * result to the caller's own rows. Filtering by user_id in the query would
 * merely duplicate a guarantee the database is making.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  const sortParam = params.get('sort') ?? 'created_at';
  const sort: SortField = sortParam in SORT_FIELDS ? (sortParam as SortField) : 'created_at';
  const ascending = params.get('dir') !== 'desc';

  const priority = params.get('priority');
  const search = params.get('q')?.trim();

  try {
    let query = createUserDataClient().from('contacts').select('*');

    if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
      query = query.eq('priority', priority);
    }

    if (search) {
      // Case-insensitive match across the fields a person would search by.
      const escaped = search.replace(/[%,()]/g, ' ');
      query = query.or(
        `name.ilike.*${escaped}*,company.ilike.*${escaped}*,role.ilike.*${escaped}*,where_met.ilike.*${escaped}*`,
      );
    }

    const { data, error } = await query.order(SORT_FIELDS[sort], { ascending });

    if (error) {
      return NextResponse.json({ error: 'Could not load your contacts.' }, { status: 500 });
    }

    return NextResponse.json({ contacts: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Could not load your contacts.' }, { status: 500 });
  }
}

/**
 * POST /api/contacts — create a contact.
 *
 * `user_id` is deliberately never taken from the request body. The column
 * defaults to auth.user_id(), so the database stamps ownership itself and a
 * client cannot create a row on someone else's behalf.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const result = validate(contactInputSchema, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, fieldErrors: result.errors },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await createUserDataClient()
      .from('contacts')
      .insert(result.data)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not save that contact.' }, { status: 500 });
    }

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not save that contact.' }, { status: 500 });
  }
}
