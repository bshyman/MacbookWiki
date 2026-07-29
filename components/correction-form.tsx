'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STEPS, missingRequired } from '@/lib/intake-steps';
import type { DraftPayload } from '@/lib/intake-schema';
import { correctRecord } from '@/app/(home)/intake/actions';

const inputClass =
  'w-full rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground';

/** Steps 2, 4 and 5 are procedural — they capture nothing, so they'd render empty. */
const STEPS_WITH_FIELDS = STEPS.filter((s) => s.fields.length > 0);
const ALL_FIELDS = STEPS_WITH_FIELDS.flatMap((s) => s.fields);

function display(key: keyof DraftPayload, value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  const field = ALL_FIELDS.find((f) => f.key === key);
  const option = field?.options?.find((o) => o.value === String(value));
  return option ? option.label : String(value);
}

export function CorrectionForm({
  recordId,
  original,
  serial,
}: {
  recordId: number;
  original: DraftPayload;
  serial: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DraftPayload>(original);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = useMemo(
    () =>
      ALL_FIELDS.filter((f) => {
        const before = original[f.key] ?? '';
        const after = values[f.key] ?? '';
        return String(before) !== String(after);
      }),
    [values, original],
  );

  const missing = missingRequired(values);
  const canSubmit = changed.length > 0 && note.trim().length > 0 && missing.length === 0;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await correctRecord({
        ...values,
        supersedesId: recordId,
        correctionNote: note.trim(),
      });
      if (res.ok) router.push(`/records?committed=${res.id}`);
      else setError(res.error);
    });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 text-sm">
        <p>
          Correcting record <strong>#{recordId}</strong> ({serial}). The original is never
          modified — this files a <em>new</em> record that supersedes it, and both stay in the
          ledger permanently.
        </p>
        <p className="mt-2 text-xs text-fd-muted-foreground">
          A record can only be corrected once, so the history stays a straight line. If this
          correction is itself wrong, correct the correction.
        </p>
      </div>

      {STEPS_WITH_FIELDS.map((step) => (
        <section key={step.slug}>
          <div className="mb-3 flex items-baseline gap-3 border-b border-fd-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{step.title}</h2>
            <Link href={step.doc} className="text-xs text-fd-primary underline underline-offset-2">
              docs
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {step.fields.map((f) => {
              const id = `correct-${String(f.key)}`;
              const isChanged = changed.some((c) => c.key === f.key);
              const value = values[f.key] == null ? '' : String(values[f.key]);
              const onChange = (v: string) =>
                setValues((prev) => ({ ...prev, [f.key]: v }) as DraftPayload);

              return (
                <div key={String(f.key)} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <label htmlFor={id} className="text-sm font-medium">
                      {f.label}
                    </label>
                    {isChanged && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        changed
                      </span>
                    )}
                  </div>

                  {f.kind === 'textarea' ? (
                    <textarea
                      id={id}
                      rows={2}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className={inputClass}
                    />
                  ) : f.kind === 'select' ? (
                    <select
                      id={id}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={f.kind === 'number' ? 'number' : 'text'}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className={inputClass}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}

                  {isChanged && (
                    <p className="mt-1 text-xs text-fd-muted-foreground">
                      was <span className="line-through">{display(f.key, original[f.key])}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <div className="mb-3 border-b border-fd-border pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Reason</h2>
        </div>

        {changed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-fd-border px-3 py-6 text-center text-sm text-fd-muted-foreground">
            Nothing changed yet. Edit a field above to file a correction.
          </p>
        ) : (
          <div className="mb-4 rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-sm">
            <strong>
              {changed.length} field{changed.length === 1 ? '' : 's'} will change:
            </strong>
            <ul className="mt-1.5 space-y-0.5">
              {changed.map((f) => (
                <li key={String(f.key)} className="text-fd-muted-foreground">
                  {f.label}:{' '}
                  <span className="line-through">{display(f.key, original[f.key])}</span>{' '}
                  <span aria-hidden>→</span>{' '}
                  <span className="text-fd-foreground">{display(f.key, values[f.key])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label htmlFor="correction-note" className="mb-1.5 block text-sm font-medium">
          Why is this being corrected?
        </label>
        <textarea
          id="correction-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Battery re-measured after a full charge cycle; original reading was taken mid-charge."
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-fd-muted-foreground">
          Required, and permanent. This is the audit trail.
        </p>
      </section>

      {missing.length > 0 && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          Required fields are blank: {missing.join(', ')}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-fd-border pt-5">
        <Link href="/records" className="rounded-lg border border-fd-border px-4 py-2 text-sm">
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-40"
        >
          {pending ? 'Filing…' : 'File correction'}
        </button>
        {!canSubmit && changed.length > 0 && note.trim().length === 0 && (
          <span className="text-xs text-fd-muted-foreground">A reason is required</span>
        )}
      </div>
    </div>
  );
}
