import Link from 'next/link';
import type { Metadata } from 'next';
import { listDrafts } from '@/lib/intake';
import { STEPS } from '@/lib/intake-steps';
import { startIntake } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Intake drafts' };

export default async function IntakeListPage() {
  const drafts = await listDrafts();

  async function start(formData: FormData) {
    'use server';
    await startIntake(String(formData.get('operator') ?? ''));
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Intake</h1>
      <p className="mt-1 text-sm text-fd-muted-foreground">
        Work in progress. Drafts are editable; committed records are not.
      </p>

      <form action={start} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-fd-border bg-fd-card p-4">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="operator" className="mb-1.5 block text-sm font-medium">
            Your name
          </label>
          <input
            id="operator"
            name="operator"
            required
            placeholder="Who's running this intake?"
            className="w-full rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          Start new intake
        </button>
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
