'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Highlight } from './highlight';
import { BLOCKER_BADGES } from '@/lib/intake-schema';

/**
 * Flattened server-side so this component never receives a Date — the old page
 * formatted timestamps with the *server's* locale, which is both wrong for an
 * audit ledger and a hydration mismatch waiting to happen.
 */
export interface RecordRow {
  id: number;
  serial: string;
  identifier: string;
  name: string | null;
  model: string | null;
  cpu: string | null;
  year: number | null;
  ramBytes: number | null;
  hdBytes: number | null;
  ram: string;
  hd: string;
  batteryHealth: number | null;
  batteryCycles: number | null;
  blockers: string[];
  physicalIssues: string | null;
  functionalIssues: string | null;
  processedAt: string;
  processedAtIso: string;
  ingestedBy: string;
  supersedesId: number | null;
  correctionNote: string | null;
  superseded: boolean;
}

type SortKey =
  | 'id' | 'name' | 'serial' | 'identifier' | 'model' | 'year'
  | 'ramBytes' | 'hdBytes' | 'batteryHealth' | 'processedAtIso' | 'ingestedBy';

interface Filters {
  q: string;
  ident: string;
  operator: string;
  status: '' | 'blocked' | 'clear';
  history: 'all' | 'current';
  sortKey: SortKey;
  sortDir: 1 | -1;
}

const INITIAL: Filters = {
  q: '',
  ident: '',
  operator: '',
  status: '',
  history: 'all',
  sortKey: 'id',
  sortDir: -1,
};

const STORAGE_KEY = 'mbw-records-v1';

// sortValue rather than the rendered text: sorting "1 TB" and "512 GB" as
// strings puts the terabyte first. Column order matches the old static table.
interface Column {
  key: SortKey | 'blockers' | 'actions';
  label: string;
  sortValue?: (r: RecordRow) => string | number | null;
}

const COLUMNS: Column[] = [
  { key: 'id', label: '#', sortValue: (r) => r.id },
  { key: 'name', label: 'Name', sortValue: (r) => r.name },
  { key: 'serial', label: 'Serial', sortValue: (r) => r.serial },
  { key: 'identifier', label: 'Identifier', sortValue: (r) => r.identifier },
  { key: 'model', label: 'Model', sortValue: (r) => r.model },
  { key: 'year', label: 'Year', sortValue: (r) => r.year },
  { key: 'ramBytes', label: 'RAM', sortValue: (r) => r.ramBytes },
  { key: 'hdBytes', label: 'HD', sortValue: (r) => r.hdBytes },
  { key: 'batteryHealth', label: 'Battery', sortValue: (r) => r.batteryHealth },
  { key: 'blockers', label: 'Locks' },
  { key: 'processedAtIso', label: 'Processed', sortValue: (r) => r.processedAtIso },
  { key: 'ingestedBy', label: 'By', sortValue: (r) => r.ingestedBy },
  { key: 'actions', label: '' },
];

const SORTABLE = new Map(
  COLUMNS.filter((c) => c.sortValue).map((c) => [c.key as SortKey, c.sortValue!]),
);

const selectClass =
  'rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground';

function matches(r: RecordRow, terms: string[], f: Filters): boolean {
  if (f.ident && r.identifier !== f.ident) return false;
  if (f.operator && r.ingestedBy !== f.operator) return false;
  if (f.status === 'blocked' && r.blockers.length === 0) return false;
  if (f.status === 'clear' && r.blockers.length > 0) return false;
  if (f.history === 'current' && r.superseded) return false;
  if (terms.length === 0) return true;
  const blob = [
    r.id, r.serial, r.name, r.identifier, r.model, r.cpu,
    r.ingestedBy, r.physicalIssues, r.functionalIssues,
  ]
    .join(' ')
    .toLowerCase();
  return terms.every((t) => blob.includes(t));
}

export function RecordsTable({
  rows,
  total,
  limit,
}: {
  rows: RecordRow[];
  total: number;
  limit: number;
}) {
  const [f, setF] = useState<Filters>(INITIAL);
  const [loaded, setLoaded] = useState(false);
  // Deliberately not persisted like the filters are — a selection that outlives
  // the tab would silently export rows nobody meant to pick.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setF({ ...INITIAL, ...JSON.parse(saved) });
    } catch {
      /* private mode, ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {
      /* quota or private mode, ignore */
    }
  }, [f, loaded]);

  const identifiers = useMemo(
    () => [...new Set(rows.map((r) => r.identifier))].sort(),
    [rows],
  );
  const operators = useMemo(() => [...new Set(rows.map((r) => r.ingestedBy))].sort(), [rows]);

  const visible = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];
    const sortValue = SORTABLE.get(f.sortKey) ?? ((r: RecordRow) => r.id);
    const out = rows.filter((r) => matches(r, terms, f));
    out.sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      // Nulls last regardless of direction — a blank year isn't "before 2006".
      if (av === null || av === '') return bv === null || bv === '' ? 0 : 1;
      if (bv === null || bv === '') return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * f.sortDir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * f.sortDir;
    });
    return out;
  }, [rows, f]);

  const selectedVisible = useMemo(
    () => visible.reduce((n, r) => (selected.has(r.id) ? n + 1 : n), 0),
    [visible, selected],
  );
  const allVisible = visible.length > 0 && selectedVisible === visible.length;
  const idsField = useMemo(() => [...selected].join(','), [selected]);

  // Indeterminate is DOM-only — there's no React prop for it.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisible > 0 && !allVisible;
    }
  }, [selectedVisible, allVisible]);

  const toggleRow = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Acts on the filtered set, so this doubles as "select everything matching".
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (allVisible) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  const needle = f.q.trim().toLowerCase();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const toggleSort = (key: SortKey) =>
    setF((prev) =>
      prev.sortKey === key
        ? { ...prev, sortDir: (prev.sortDir * -1) as 1 | -1 }
        : { ...prev, sortKey: key, sortDir: 1 },
    );

  return (
    <div className="mt-6 flex flex-col gap-4">
      {rows.length >= limit && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Showing the {limit.toLocaleString()} most recent of {total.toLocaleString()} records.
          Filters apply only to what&rsquo;s loaded —{' '}
          <a href="/records/export" className="underline underline-offset-2">
            export the full ledger
          </a>{' '}
          to search everything.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={f.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Search serial, name, identifier, issues, operator…"
          className="min-w-[280px] max-w-md flex-1 rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm"
          aria-label="Search records"
        />

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Identifier
          <select value={f.ident} onChange={(e) => set('ident', e.target.value)} className={selectClass}>
            <option value="">All</option>
            {identifiers.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Operator
          <select
            value={f.operator}
            onChange={(e) => set('operator', e.target.value)}
            className={selectClass}
          >
            <option value="">All</option>
            {operators.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Status
          <select
            value={f.status}
            onChange={(e) => set('status', e.target.value as Filters['status'])}
            className={selectClass}
          >
            <option value="">All</option>
            <option value="blocked">Blocked</option>
            <option value="clear">Clear</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          History
          <select
            value={f.history}
            onChange={(e) => set('history', e.target.value as Filters['history'])}
            className={selectClass}
            title="Current hides rows that a later correction supersedes"
          >
            <option value="all">Full ledger</option>
            <option value="current">Current only</option>
          </select>
        </label>

        <span className="ml-auto text-xs text-fd-muted-foreground" aria-live="polite">
          {visible.length.toLocaleString()} of {rows.length.toLocaleString()} loaded ·{' '}
          {total.toLocaleString()} in the ledger
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-fd-primary/30 bg-fd-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">
            {selected.size.toLocaleString()} selected
            {selected.size > selectedVisible && (
              <span className="ml-1 font-normal text-fd-muted-foreground">
                ({(selected.size - selectedVisible).toLocaleString()} outside the current filter)
              </span>
            )}
          </span>

          {/* Native form POST rather than fetch — the browser handles the download,
              and a few thousand ids would blow past URL length limits on a GET. */}
          <form method="POST" action="/records/export" className="contents">
            <input type="hidden" name="ids" value={idsField} />
            <button
              type="submit"
              className="rounded-lg bg-fd-primary px-3 py-1.5 text-xs font-medium text-fd-primary-foreground"
            >
              Export selected as CSV
            </button>
          </form>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-fd-muted-foreground underline underline-offset-2"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-fd-border">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-10 border-b border-fd-border bg-fd-card px-3 py-2.5">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisible}
                  onChange={toggleAllVisible}
                  disabled={visible.length === 0}
                  className="align-middle"
                  aria-label={`Select all ${visible.length} matching records`}
                  title={`Select all ${visible.length} matching records`}
                />
              </th>
              {COLUMNS.map((col) => {
                const sortable = Boolean(col.sortValue);
                const active = sortable && f.sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={sortable ? () => toggleSort(col.key as SortKey) : undefined}
                    aria-sort={active ? (f.sortDir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={`sticky top-0 z-10 select-none whitespace-nowrap border-b border-fd-border bg-fd-card px-3 py-2.5 text-left font-semibold ${
                      sortable ? 'cursor-pointer' : ''
                    }`}
                  >
                    {col.label}
                    {active && (
                      <span className="ml-1 text-fd-muted-foreground">
                        {f.sortDir === 1 ? '▴' : '▾'}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-fd-border/60 last:border-0 hover:bg-fd-accent/40 ${
                  r.superseded ? 'text-fd-muted-foreground' : ''
                }`}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleRow(r.id)}
                    className="align-middle"
                    aria-label={`Select record ${r.id}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  {r.id}
                  {r.superseded && (
                    <span
                      className="ml-1.5 rounded bg-fd-secondary px-1.5 py-0.5 text-[10px] uppercase"
                      title="A later record corrects this one"
                    >
                      superseded
                    </span>
                  )}
                  {r.supersedesId && (
                    <span
                      className="ml-1.5 cursor-help rounded bg-fd-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-fd-primary"
                      title={r.correctionNote ?? undefined}
                    >
                      corrects #{r.supersedesId}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {r.name ? <Highlight text={r.name} needle={needle} /> : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  <Highlight text={r.serial} needle={needle} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  <Highlight text={r.identifier} needle={needle || f.ident.toLowerCase()} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.model ? <Highlight text={r.model} needle={needle} /> : '—'}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{r.year ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.ram}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.hd}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.batteryHealth === null ? '—' : `${r.batteryHealth}%`}
                  {r.batteryCycles !== null && (
                    <span className="text-fd-muted-foreground"> · {r.batteryCycles}c</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {r.blockers.length === 0 ? (
                    <span className="text-fd-muted-foreground">clear</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.blockers.map((b) => (
                        <span
                          key={b}
                          className="whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
                        >
                          {BLOCKER_BADGES[b] ?? b}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                  <time dateTime={r.processedAtIso}>{r.processedAt}</time>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Highlight text={r.ingestedBy} needle={needle} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {r.superseded ? (
                    <span
                      className="text-xs text-fd-muted-foreground"
                      title="Already corrected — correct its successor instead"
                    >
                      —
                    </span>
                  ) : (
                    <Link
                      href={`/records/${r.id}/correct`}
                      className="text-xs text-fd-primary underline underline-offset-2"
                    >
                      Correct
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-3 py-8 text-center text-fd-muted-foreground"
                >
                  No records match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
