'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    setPending(true);
    try {
      await authClient.signOut();
      router.push('/auth/sign-in');
      router.refresh();
    } catch {
      toast.error('Could not sign out. Please try again.');
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onSignOut} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
