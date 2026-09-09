import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/server';
import { createUserDataClient } from '@/lib/neon/data-api';
import { contactUpdateSchema, validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/contacts/:id — edit a contact.
 *
 * The query filters on `id` alone. It does not add `user_id = <me>`, because
 * the UPDATE policy's USING clause already restricts the target rows and its
 * WITH CHECK clause rejects any result that would not still belong to the
 * caller. Aiming this at another user's ID matches zero rows and returns 404.
 */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'That contact ID is not valid.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  // Ownership is not a client-editable field. Drop it before validating so a
  // request carrying user_id is ignored rather than honoured.
  if (body && typeof body === 'object') {
    delete (body as Record<string, unknown>).user_id;
    delete (body as Record<string, unknown>).id;
  }

  const result = validate(contactUpdateSchema, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, fieldErrors: result.errors },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await createUserDataClient()
      .from('contacts')
      .update(result.data)
      .eq('id', id)
      .select();

    if (error) {
      console.error('[contacts] data api:', error);
      return NextResponse.json({ error: 'Could not update that contact.' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
    }

    return NextResponse.json({ contact: data[0] });
  } catch (error) {
    console.error('[contacts]', error);
    return NextResponse.json({ error: 'Could not update that contact.' }, { status: 500 });
  }
}

/** DELETE /api/contacts/:id — RLS restricts this to the caller's own rows. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'That contact ID is not valid.' }, { status: 400 });
  }

  try {
    const { data, error } = await createUserDataClient()
      .from('contacts')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('[contacts] data api:', error);
      return NextResponse.json({ error: 'Could not delete that contact.' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[contacts]', error);
    return NextResponse.json({ error: 'Could not delete that contact.' }, { status: 500 });
  }
}
