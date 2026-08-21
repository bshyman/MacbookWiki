'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useRef, useState, useTransition } from 'react';
import {
  commitImport,
  previewImport,
  type PreviewResult,
  type PreviewRow,
} from '@/app/(home)/records/import/actions';
import { parseCsv } from '@/lib/csv';
import { FIELD_LABELS, type ImportField } from '@/lib/csv-columns';
import { MAX_IMPORT_ROWS } from '@/lib/csv-import';

/** Well under the 4mb server-action cap — a 2,000-row file is ~400 KB. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const PREVIEW_COLUMNS: ImportField[] = [
  'serial',
  'identifier',
  'name',
  'model',
  'year',
  'ramBytes',
  'hdBytes',
  'batteryHealth',
  'firmwareLocked',
  'osReset',
  'activationLock',
  'mdmEnrolled',
];

/** Ledger hit or in-file repeat — both start unticked, so they read the same. */
const isDuplicate = (r: PreviewRow) => r.duplicateOf.length > 0 || r.repeatOfLine !== null;

const errorBox =
  'rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400';
const warnBox =
  'rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400';

export function CsvImport() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [showValid, setShowValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setText('');
    setFileName('');
    setPreview(null);
    setIncluded(new Set());
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  async function onFile(file: File) {
    reset();
    setFileName(file.name);

    // Both caps are checked here so an oversized file never leaves the browser —
    // a 413 from the action would surface as an opaque crash.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Imports are capped at 2 MB (~${MAX_IMPORT_ROWS.toLocaleString()} rows). Split it and import in batches.`,
      );
      return;
    }

    const contents = await file.text();
    let rowCount = 0;
    try {
      rowCount = Math.max(parseCsv(contents).length - 1, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      return;
    }
    if (rowCount > MAX_IMPORT_ROWS) {
      setError(
        `That file has ${rowCount.toLocaleString()} rows. Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} — split it and import in batches.`,
      );
      return;
    }

    setText(contents);
    startTransition(async () => {
      const result = await previewImport(contents);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result);
      // Duplicates start unchecked. Re-importing an export is the easiest way to
      // permanently double the ledger, so including one has to be deliberate.
      setIncluded(
        new Set(
          result.rows
            .filter((r) => r.issues.length === 0 && !isDuplicate(r))
            .map((r) => r.line),
        ),
      );
    });
  }

  function commit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await commitImport(text, preview.csvHash, [...included]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/records?imported=${result.inserted}`);
    });
  }

  const toggle = (line: number) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  const { badRows, goodRows } = useMemo(() => {
    const rows = preview?.rows ?? [];
    return {
      badRows: rows.filter((r) => r.issues.length > 0),
      goodRows: rows.filter((r) => r.issues.length === 0),
    };
  }, [preview]);

  const setAllDuplicates = (on: boolean) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      for (const r of goodRows) {
        if (!isDuplicate(r)) continue;
        if (on) next.add(r.line);
        else next.delete(r.line);
      }
      return next;
    });

  if (!preview) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div className="rounded-xl border border-dashed border-fd-border px-4 py-10 text-center">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="mx-auto block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-fd-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-fd-primary-foreground"
          />
          <p className="mt-3 text-sm text-fd-muted-foreground">
            {pending ? `Reading ${fileName}…` : 'Nothing is written until you review and confirm.'}
          </p>
        </div>
        {error && <p className={errorBox}>{error}</p>}
        <p className="text-sm text-fd-muted-foreground">
          Not sure about the columns?{' '}
          <a href="/records/import/template" className="text-fd-primary underline underline-offset-2">
            Download a blank template
          </a>
          .
        </p>
      </div>
    );
  }

  const total = preview.rows.length;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fd-border bg-fd-card px-4 py-3 text-sm">
        <span>
          <span className="font-medium">{fileName}</span> · {total.toLocaleString()} rows ·{' '}
          {preview.validCount.toLocaleString()} valid
          {badRows.length > 0 && ` · ${badRows.length.toLocaleString()} with errors`}
          {preview.duplicateCount > 0 && ` · ${preview.duplicateCount.toLocaleString()} duplicates`}
        </span>
        <button type="button" onClick={reset} className="text-fd-primary underline underline-offset-2">
          Choose a different file
        </button>
      </div>

      {preview.unknownHeaders.length > 0 && (
        <p className={warnBox}>
          Ignoring unrecognized columns: {preview.unknownHeaders.join(', ')}
        </p>
      )}
      {preview.ignoredHeaders.length > 0 && (
        <p className="text-xs text-fd-muted-foreground">
          Stamped server-side, so these columns are ignored: {preview.ignoredHeaders.join(', ')}.
          Every row will be recorded as processed now, by you.
        </p>
      )}

      {preview.duplicateCount > 0 && (
        <div className={`${warnBox} flex flex-wrap items-center justify-between gap-3`}>
          <span>
            {preview.duplicateCount.toLocaleString()} of {total.toLocaleString()} rows repeat a
            serial — already live in the ledger, or used earlier in this same file. They start
            excluded — a committed record can be archived, but never removed.
          </span>
          <span className="flex gap-3 whitespace-nowrap">
            <button type="button" onClick={() => setAllDuplicates(true)} className="underline underline-offset-2">
              Include all
            </button>
            <button type="button" onClick={() => setAllDuplicates(false)} className="underline underline-offset-2">
              Exclude all
            </button>
          </span>
        </div>
      )}

      {badRows.length > 0 && (
        <Section title={`${badRows.length.toLocaleString()} row${badRows.length === 1 ? '' : 's'} with errors`}>
          <RowTable rows={badRows} included={included} toggle={toggle} />
        </Section>
      )}

      {goodRows.length > 0 && (
        <Section
          title={`${goodRows.length.toLocaleString()} valid row${goodRows.length === 1 ? '' : 's'}`}
          action={
            <button
              type="button"
              onClick={() => setShowValid((v) => !v)}
              className="text-fd-primary underline underline-offset-2"
            >
              {showValid ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showValid && <RowTable rows={goodRows} included={included} toggle={toggle} />}
        </Section>
      )}

      {error && <p className={errorBox}>{error}</p>}

      <div className="flex items-center gap-3 border-t border-fd-border pt-5">
        <Link href="/records" className="rounded-lg border border-fd-border px-4 py-2 text-sm">
          Cancel
        </Link>
        <button
          type="button"
          onClick={commit}
          disabled={included.size === 0 || pending}
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-40"
        >
          {pending
            ? 'Committing…'
            : `Commit ${included.size.toLocaleString()} record${included.size === 1 ? '' : 's'} — permanent`}
        </button>
        {included.size === 0 && (
          <span className="text-xs text-fd-muted-foreground">Nothing selected</span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RowTable({
  rows,
  included,
  toggle,
}: {
  rows: PreviewRow[];
  included: Set<number>;
  toggle: (line: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-fd-border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-fd-border bg-fd-card text-left">
            <th className="w-10 px-3 py-2.5" />
            <th className="px-3 py-2.5 font-semibold">Line</th>
            {PREVIEW_COLUMNS.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {FIELD_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const broken = r.issues.length > 0;
            const noted = broken || isDuplicate(r);
            return (
              <Fragment key={r.line}>
                <tr className={`align-top ${noted ? '' : 'border-b border-fd-border/60'}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={included.has(r.line)}
                      disabled={broken}
                      onChange={() => toggle(r.line)}
                      aria-label={`Include line ${r.line}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-fd-muted-foreground">{r.line}</td>
                  {PREVIEW_COLUMNS.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2.5">
                      {r.cells[c] ?? <span className="text-fd-muted-foreground">—</span>}
                      {/* Show what the unit guess resolved to, before it's permanent. */}
                      {c === 'ramBytes' && r.ramBytes !== null && (
                        <span className="block text-[11px] text-fd-muted-foreground tabular-nums">
                          {r.ramBytes.toLocaleString()} B
                        </span>
                      )}
                      {c === 'hdBytes' && r.hdBytes !== null && (
                        <span className="block text-[11px] text-fd-muted-foreground tabular-nums">
                          {r.hdBytes.toLocaleString()} B
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                {noted && (
                  <tr className="border-b border-fd-border/60 last:border-0">
                    <td />
                    <td colSpan={PREVIEW_COLUMNS.length + 1} className="px-3 pb-2.5 text-xs">
                      {broken && (
                        <span className="text-red-600 dark:text-red-400">
                          {r.issues.map((i) => `${i.field}: ${i.message}`).join(' · ')}
                        </span>
                      )}
                      {r.duplicateOf.length > 0 && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {broken && ' · '}
                          already in the ledger as {r.duplicateOf.map((id) => `#${id}`).join(', ')}
                        </span>
                      )}
                      {r.repeatOfLine !== null && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {(broken || r.duplicateOf.length > 0) && ' · '}
                          same serial as line {r.repeatOfLine} of this file
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
