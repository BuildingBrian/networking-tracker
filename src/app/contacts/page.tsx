import { redirect } from 'next/navigation';

import { ContactsApp } from '@/components/contacts-app';
import { getSessionUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your contacts · Networking Tracker' };

export default async function ContactsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth/sign-in');

  return <ContactsApp userEmail={user.email} userName={user.name ?? null} />;
}
