'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSessionToken,
  passwordMatches,
  safeNext,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '@/lib/auth';

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const operator = String(formData.get('operator') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? ''));

  if (!operator) return { error: 'Enter your name — it goes on every record you commit.' };
  if (operator.length > 80) return { error: 'That name is too long.' };
  // One message for both failures so it doesn't confirm which half was wrong.
  if (!password || !(await passwordMatches(password))) {
    return { error: 'Wrong password.' };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(operator), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(next);
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/signin');
}
