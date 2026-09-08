import { AuthForm } from '@/components/auth-form';

export const metadata = { title: 'Sign up · Networking Tracker' };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
