'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STEPS, labelFor, missingRequired, type Field } from '@/lib/intake-steps';
import { BLOCKER_LABELS, deriveBlockers, type DraftPayload } from '@/lib/intake-schema';
import { formatBytes } from '@/lib/format';
import { MODELS, identifiersOf } from '@/lib/models';
import { commitDraft, syncDraft } from '@/app/(home)/intake/actions';

const localKey = (id: string) => `intake-draft:${id}`;

/** Identifier → the row that carries it, for auto-filling Name / Model / Year / CPU. */
const BY_IDENTIFIER = new Map(
  MODELS.flatMap((m) => identifiersOf(m).map((id) => [id.toLowerCase(), m] as const)),
);

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function IntakeWizard({
  draftId,
  initialStep,
  initialPayload,
  operator,
}: {
  draftId: string;
  initialStep: number;
  initialPayload: DraftPayload;
  /** From the session. Display only — the server stamps the record from its own copy. */
  operator: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<DraftPayload>(initialPayload);
  const [stepIndex, setStepIndex] = useState(Math.min(Math.max(initialStep - 1, 0), STEPS.length - 1));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [commitError, setCommitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);
  // Nothing to sync until something actually changes — otherwise every page load
  // and every step change costs a redundant write.
  const dirty = useRef(false);

  // Local first: a browser crash mid-intake shouldn't cost the operator the unit.
  // The DB copy is written on step change, so this covers everything typed since.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(localKey(draftId));
      if (cached) {
        const parsed = JSON.parse(cached) as DraftPayload;
        setPayload((p) => ({ ...p, ...parsed }));
        // Local holding edits the DB never got is exactly the crash case — let
        // those sync up rather than waiting for the next keystroke.
        if (JSON.stringify({ ...initialPayload, ...parsed }) !== JSON.stringify(initialPayload)) {
          dirty.current = true;
        }
      }
    } catch {
      /* private mode */
    }
    hydrated.current = true;
    // initialPayload is the server snapshot for this draft — stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(localKey(draftId), JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, [payload, draftId]);

  const step = STEPS[stepIndex];
  const missing = useMemo(() => missingRequired(payload), [payload]);

  const set = useCallback((key: keyof DraftPayload, value: string) => {
    dirty.current = true;
    setPayload((prev) => {
      const next = { ...prev, [key]: value } as DraftPayload;
      // Deriving from the Identifier is the whole point of having the dataset —
      // three columns from one value the operator already has.
      //
      // CPU is deliberately NOT derived. The dataset's cpu field describes the
      // whole row, which on M-series spans two chips ("M3 Pro … · M3 Max …") and
      // on Intel spans a clock range. Prefilling that invites an operator to
      // accept a value that isn't this machine's. It comes from
      // `machdep.cpu.brand_string` instead.
      if (key === 'identifier') {
        const match = BY_IDENTIFIER.get(value.trim().toLowerCase());
        if (match) {
          if (!prev.name) next.name = match.family;
          if (!prev.model) next.model = match.modelNumber;
          if (!prev.year) next.year = String(match.year);
        }
      }
      return next;
    });
  }, []);

  const persist = useCallback(
    (nextStep: number) =>
      new Promise<void>((resolve) => {
        setSaveState('saving');
        startTransition(async () => {
          try {
            const res = await syncDraft(draftId, nextStep + 1, payload);
            setSaveState(res.ok ? 'saved' : 'error');
            if (res.ok) dirty.current = false;
          } catch {
            // Transport failure. The local copy still holds everything.
            setSaveState('error');
          } finally {
            // Always — goto() awaits this, and a rejection used to leave the
            // wizard stuck on the current step with the buttons disabled.
            resolve();
          }
        });
      }),
    [draftId, payload],
  );

  // Step changes are the main sync point, but the last step has no step after it —
  // without this, anything typed on the review screen only ever lives in
  // localStorage. Debounced so it doesn't fire per keystroke.
  useEffect(() => {
    if (!hydrated.current || !dirty.current) return;
    const t = setTimeout(() => {
      void syncDraft(draftId, stepIndex + 1, payload)
        .then((res) => {
          setSaveState(res.ok ? 'saved' : 'error');
          if (res.ok) dirty.current = false;
        })
        .catch(() => setSaveState('error'));
    }, 2000);
    return () => clearTimeout(t);
  }, [payload, stepIndex, draftId]);

  const goto = async (next: number) => {
    const clamped = Math.min(Math.max(next, 0), STEPS.length - 1);
    await persist(clamped);
    setStepIndex(clamped);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const commit = () => {
    setCommitError(null);
    startTransition(async () => {
      const res = await commitDraft(draftId, payload);
      if (res.ok) {
        try {
          localStorage.removeItem(localKey(draftId));
        } catch {
          /* ignore */
        }
        router.push(`/records?committed=${res.id}`);
      } else {
        setCommitError(res.error);
      }
    });
  };

  const isLast = stepIndex === STEPS.length - 1;
  const derived = BY_IDENTIFIER.get(String(payload.identifier ?? '').trim().toLowerCase());

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ProgressRail
        current={stepIndex}
        payload={payload}
        onJump={(i) => void goto(i)}
        disabled={pending}
      />

      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-3 text-xs text-fd-muted-foreground">
          <span>
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <SaveBadge state={saveState} />
        </div>

        <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-1 text-sm text-fd-muted-foreground">{step.summary}</p>
        <Link
          href={step.doc}
          className="mt-2 inline-block text-xs text-fd-primary underline underline-offset-2"
        >
          Full procedure →
        </Link>

        {step.commands && (
          <div className="mt-5 space-y-2">
            {step.commands.map((c) => (
              <CommandRow key={c.code} code={c.code} note={c.note} />
            ))}
          </div>
        )}

        {step.fields.length > 0 && (
          <div className="mt-6 space-y-5">
            {step.fields.map((f) => (
              <FieldInput
                key={String(f.key)}
                field={f}
                value={payload[f.key] == null ? '' : String(payload[f.key])}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
        )}

        {step.slug === 'intake-commands' && derived && (
          <p className="mt-4 rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-xs text-fd-muted-foreground">
            Matched <strong className="text-fd-foreground">{derived.name}</strong> — Name, Model and
            Year filled from the lookup. Overwrite them if the machine disagrees. CPU isn&apos;t
            derived: read it off <code>machdep.cpu.brand_string</code>, since one Identifier can
            cover more than one chip.
          </p>
        )}

        {isLast && <Review payload={payload} missing={missing} operator={operator} />}

        {commitError && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {commitError}
          </p>
        )}

        <div className="mt-8 flex items-center gap-3 border-t border-fd-border pt-5">
          <button
            type="button"
            onClick={() => void goto(stepIndex - 1)}
            disabled={stepIndex === 0 || pending}
            className="rounded-lg border border-fd-border px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={commit}
              disabled={pending || missing.length > 0}
              className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-40"
            >
              {pending ? 'Committing…' : 'Commit intake'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void goto(stepIndex + 1)}
              disabled={pending}
              className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-40"
            >
              Next →
            </button>
          )}

          {isLast &&
            (missing.length > 0 ? (
              <span className="text-xs text-red-500">
                Serial is required — it&rsquo;s the one value every machine has, even dead ones
              </span>
            ) : (
              <span className="text-xs text-fd-muted-foreground">
                Draft only until committed — blank fields are recorded as &ldquo;not
                checked&rdquo;
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function ProgressRail({
  current,
  payload,
  onJump,
  disabled,
}: {
  current: number;
  payload: DraftPayload;
  onJump: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <nav aria-label="Intake steps" className="lg:sticky lg:top-24 lg:self-start">
      <ol className="flex flex-wrap gap-1 lg:flex-col">
        {STEPS.map((s, i) => {
          const filled =
            s.fields.length > 0 &&
            s.fields.every((f) => {
              const v = payload[f.key];
              return v !== null && v !== undefined && String(v).trim() !== '';
            });
          const state = i === current ? 'current' : filled ? 'done' : 'todo';
          return (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={disabled}
                aria-current={i === current ? 'step' : undefined}
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                  state === 'current'
                    ? 'bg-fd-accent font-medium text-fd-accent-foreground'
                    : 'text-fd-muted-foreground hover:bg-fd-accent/50',
                ].join(' ')}
              >
                <span
                  className={[
                    'grid size-5 shrink-0 place-items-center rounded-full border text-[10px] tabular-nums',
                    state === 'done'
                      ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground'
                      : state === 'current'
                        ? 'border-fd-primary text-fd-primary'
                        : 'border-fd-border',
                  ].join(' ')}
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Every state names the draft. "Synced" alone read as "done" — operators marked
// machines complete off this badge while the record was never committed.
function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return <span className="text-fd-muted-foreground">Draft saved locally</span>;
  if (state === 'saving') return <span>Saving draft…</span>;
  if (state === 'saved') return <span className="text-fd-primary">Draft synced — not committed</span>;
  return <span className="text-red-500">Sync failed — draft kept locally</span>;
}

function CommandRow({ code, note }: { code: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-[12.5px]">{code}</code>
      <span className="hidden shrink-0 text-xs text-fd-muted-foreground sm:inline">{note}</span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-fd-border px-2 py-1 text-[11px] hover:border-fd-primary"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground';

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${String(field.key)}`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {field.label}
        </label>
        {field.column !== '—' && (
          <span className="rounded bg-fd-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fd-muted-foreground">
            {field.column}
          </span>
        )}
      </div>

      {field.kind === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      ) : field.kind === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind === 'number' ? 'number' : 'text'}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          list={field.kind === 'identifier' ? 'identifier-options' : undefined}
          autoComplete="off"
          spellCheck={false}
        />
      )}

      {field.hint && <p className="mt-1.5 text-xs text-fd-muted-foreground">{field.hint}</p>}
    </div>
  );
}

const REVIEW_ROWS: { key: keyof DraftPayload; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'serial', label: 'Serial' },
  { key: 'identifier', label: 'Identifier' },
  { key: 'model', label: 'Model' },
  { key: 'batteryHealth', label: 'Battery' },
  { key: 'batteryCycles', label: 'Cycle Count' },
  { key: 'year', label: 'Year' },
  { key: 'ramBytes', label: 'RAM' },
  { key: 'hdBytes', label: 'HD' },
  { key: 'cpu', label: 'CPU' },
  { key: 'physicalIssues', label: 'Physical Issues' },
  { key: 'functionalIssues', label: 'Functional Issues' },
  { key: 'firmwareLocked', label: 'Firmware Locked' },
  { key: 'osReset', label: 'OS Reset' },
  { key: 'activationLock', label: 'Activation Lock' },
  { key: 'mdmEnrolled', label: 'MDM / DEP' },
];

function human(key: keyof DraftPayload, value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  // Selects carry their own wording — show 'N/A — Apple Silicon', not 'n/a'.
  const label = labelFor(key, value);
  if (label) return label;
  if (key === 'ramBytes') return formatBytes(Number(value), 1024);
  if (key === 'hdBytes') return formatBytes(Number(value), 1000);
  if (key === 'batteryHealth') return `${value}%`;
  return String(value);
}

function Review({
  payload,
  missing,
  operator,
}: {
  payload: DraftPayload;
  missing: (keyof DraftPayload)[];
  operator: string;
}) {
  // The same function that stamps the record. A second copy here used to omit
  // smart-failing, so the preview could say "clear" on a row committed with a blocker.
  const blockers = deriveBlockers(payload);

  return (
    <div className="mt-6">
      {blockers.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>Blockers — this unit is not sellable as-is:</strong>
          <ul className="mt-1 list-inside list-disc text-fd-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{BLOCKER_LABELS[b] ?? b}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-fd-muted-foreground">
            You can still commit — the record keeps the reasons alongside the values.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-fd-border">
        <table className="w-full text-sm">
          <tbody>
            {REVIEW_ROWS.map(({ key, label }) => {
              const blank = missing.includes(key);
              return (
                <tr key={String(key)} className="border-b border-fd-border/60 last:border-0">
                  <th scope="row" className="w-44 bg-fd-card px-3 py-2 text-left font-medium">
                    {label}
                  </th>
                  <td className={`px-3 py-2 ${blank ? 'text-red-500' : ''}`}>
                    {human(key, payload[key])}
                    {blank && <span className="ml-2 text-xs">required</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="w-44 bg-fd-card px-3 py-2 text-left font-medium">
                Ingested By
              </th>
              <td className="px-3 py-2">
                {operator}
                <span className="ml-2 text-xs text-fd-muted-foreground">from your sign-in</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-fd-muted-foreground">
        Committing writes a permanent row. It cannot be edited or deleted afterwards — a mistake is
        fixed by filing a correction, which keeps both versions.
      </p>
    </div>
  );
}
