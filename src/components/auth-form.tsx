'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

type Mode = 'sign-in' | 'sign-up';

const COPY = {
  'sign-in': {
    title: 'Welcome back',
    description: 'Sign in to see the people you are keeping track of.',
    submit: 'Sign in',
    pending: 'Signing in…',
    switchPrompt: 'New here?',
    switchLabel: 'Create an account',
    switchHref: '/auth/sign-up',
  },
  'sign-up': {
    title: 'Create your account',
    description: 'Start tracking the people you meet at Berkeley.',
    submit: 'Create account',
    pending: 'Creating account…',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/auth/sign-in',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === 'sign-up' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setPending(true);
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name: name.trim() || email })
          : await authClient.signIn.email({ email, password });

      if (result?.error) {
        setError(result.error.message ?? 'That did not work. Check your details and try again.');
        return;
      }

      router.push('/contacts');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-4">
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {mode === 'sign-up' ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@berkeley.edu"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'sign-up' ? 'At least 8 characters' : ''}
              />
            </div>
          </CardContent>

          <CardFooter className="mt-6 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? copy.pending : copy.submit}
            </Button>
            <p className="text-sm text-muted-foreground">
              {copy.switchPrompt}{' '}
              <Link href={copy.switchHref} className="font-medium text-foreground underline">
                {copy.switchLabel}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
