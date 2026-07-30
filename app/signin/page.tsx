import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { safeNext } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { SignInForm } from './form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage(props: PageProps<'/signin'>) {
  const { next } = await props.searchParams;
  const target = safeNext(next);

  if (await getSession()) redirect(target);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-fd-muted-foreground">
        Intake and records are restricted. The{' '}
        <Link href="/docs" className="text-fd-primary underline underline-offset-2">
          workflow docs
        </Link>{' '}
        stay open.
      </p>

      <SignInForm next={target} />
    </main>
  );
}
