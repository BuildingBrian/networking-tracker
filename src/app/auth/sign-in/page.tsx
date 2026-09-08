import { AuthForm } from '@/components/auth-form';

export const metadata = { title: 'Sign in · Networking Tracker' };

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
