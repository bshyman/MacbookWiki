import Link from 'next/link';
import type { Metadata } from 'next';
import { listDrafts } from '@/lib/intake';
import { STEPS } from '@/lib/intake-steps';
import { requireSession } from '@/lib/session';
import { signOut } from '@/app/signin/actions';
import { startIntake } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Intake drafts' };

export default async function IntakeListPage() {
  const { operator } = await requireSession();
  const drafts = await listDrafts();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Intake</h1>
        <form action={signOut} className="text-sm">
          <span className="text-fd-muted-foreground">Signed in as {operator} · </span>
          <button type="submit" className="text-fd-primary underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-1 text-sm text-fd-muted-foreground">
        Work in progress. Drafts are editable; committed records are not.
      </p>

      <form action={startIntake} className="mt-6 rounded-xl border border-fd-border bg-fd-card p-4">
        <button
          type="submit"
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          Start new intake
        </button>
        <p className="mt-2 text-xs text-fd-muted-foreground">
          Records you commit are stamped <strong>{operator}</strong>, from your sign-in.
        </p>
      </form>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-fd-muted-foreground">
        In progress ({drafts.length})
      </h2>

      {drafts.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-fd-border px-4 py-8 text-center text-sm text-fd-muted-foreground">
          No drafts. Start one above, or read the{' '}
          <Link href="/docs" className="text-fd-primary underline underline-offset-2">
            workflow
          </Link>{' '}
          first.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-fd-border overflow-hidden rounded-xl border border-fd-border">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={`/intake/${d.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-fd-accent/40"
              >
                <span className="font-medium">
                  {d.identifier || d.serial || 'Unidentified machine'}
                </span>
                <span className="text-xs text-fd-muted-foreground">
                  Step {d.step} of {STEPS.length} — {STEPS[d.step - 1]?.title ?? 'unknown'}
                </span>
                <span className="ml-auto text-xs text-fd-muted-foreground">
                  {d.started_by} · {new Date(d.updated_at).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
