'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ALL_IDENTIFIERS,
  MODELS,
  identifiersOf,
  type Family,
  type Model,
} from '@/lib/models';

type SortKey = keyof Pick<
  Model,
  'name' | 'year' | 'modelId' | 'modelNumber' | 'cpu' | 'ram' | 'storage' | 'display' | 'ports' | 'battery'
>;

interface Filters {
  q: string;
  ident: string;
  family: '' | Family;
  era: '' | 'intel' | 'silicon';
  size: string;
  sortKey: SortKey;
  sortDir: 1 | -1;
}

const INITIAL: Filters = {
  q: '',
  ident: '',
  family: '',
  era: '',
  size: '',
  sortKey: 'year',
  sortDir: 1,
};

const STORAGE_KEY = 'mbid-state';
const SIZES = ['11"', '12"', '13"', '14"', '15"', '16"', '17"'];

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Marketing Name', className: 'min-w-[260px] font-medium' },
  { key: 'year', label: 'Year' },
  { key: 'modelId', label: 'Model Identifier', className: 'min-w-[190px]' },
  { key: 'modelNumber', label: 'Model Number', className: 'whitespace-nowrap' },
  { key: 'cpu', label: 'CPU', className: 'min-w-[200px]' },
  { key: 'ram', label: 'RAM', className: 'min-w-[120px]' },
  { key: 'storage', label: 'Storage', className: 'min-w-[120px]' },
  { key: 'display', label: 'Display', className: 'min-w-[200px]' },
  { key: 'ports', label: 'Ports', className: 'min-w-[260px]' },
  { key: 'battery', label: 'Battery (Wh / max cycles)', className: 'min-w-[160px]' },
];

function matches(model: Model, terms: string[], f: Filters): boolean {
  if (f.ident && !identifiersOf(model).includes(f.ident)) return false;
  if (f.family && model.family !== f.family) return false;
  if (f.era && model.era !== f.era) return false;
  if (f.size && !model.size.includes(f.size)) return false;
  if (terms.length === 0) return true;
  const blob = [
    model.name, model.modelId, model.modelNumber, model.cpu, model.ram,
    model.storage, model.display, model.ports, model.battery, model.year, model.family,
  ]
    .join(' ')
    .toLowerCase();
  return terms.every((t) => blob.includes(t));
}

function Highlight({ text, needle }: { text: string | number; needle: string }) {
  const value = String(text);
  if (!needle) return <>{value}</>;
  const parts = value.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-fd-primary/20 px-0.5 text-fd-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const selectClass =
  'rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground';

export function ModelTable() {
  const [f, setF] = useState<Filters>(INITIAL);
  const [loaded, setLoaded] = useState(false);

  // Restore before first paint of real data so the count doesn't flash.
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

  const rows = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];
    const out = MODELS.filter((m) => matches(m, terms, f));
    out.sort((a, b) => {
      const av = a[f.sortKey];
      const bv = b[f.sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * f.sortDir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * f.sortDir;
    });
    return out;
  }, [f]);

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={f.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Search anything — “A1989”, “MacBookPro15,2”, “M2 Max 16”, “Touch Bar”…"
          className="min-w-[280px] flex-1 max-w-md rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm"
          aria-label="Search models"
        />

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Identifier
          <select
            value={f.ident}
            onChange={(e) => set('ident', e.target.value)}
            className={selectClass}
            title="Paste from sysctl -n hw.model"
          >
            <option value="">All</option>
            {ALL_IDENTIFIERS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Family
          <select
            value={f.family}
            onChange={(e) => set('family', e.target.value as Filters['family'])}
            className={selectClass}
          >
            <option value="">All</option>
            <option>MacBook Pro</option>
            <option>MacBook Air</option>
            <option>MacBook</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Era
          <select
            value={f.era}
            onChange={(e) => set('era', e.target.value as Filters['era'])}
            className={selectClass}
          >
            <option value="">All</option>
            <option value="intel">Intel (2006–2020)</option>
            <option value="silicon">Apple Silicon (2020+)</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Display
          <select
            value={f.size}
            onChange={(e) => set('size', e.target.value)}
            className={selectClass}
          >
            <option value="">Any size</option>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <span className="ml-auto text-xs text-fd-muted-foreground" aria-live="polite">
          {rows.length} of {MODELS.length} models
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-fd-border">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  aria-sort={
                    f.sortKey === col.key
                      ? f.sortDir === 1
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap border-b border-fd-border bg-fd-card px-3 py-2.5 text-left font-semibold"
                >
                  {col.label}
                  <span className="ml-1 text-fd-muted-foreground">
                    {f.sortKey === col.key ? (f.sortDir === 1 ? '▴' : '▾') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={`${m.modelId}-${m.name}`} className="border-b border-fd-border/60 last:border-0 hover:bg-fd-accent/40">
                {COLUMNS.map((col) => (
                  <td key={col.key} className={`px-3 py-2.5 align-top ${col.className ?? ''}`}>
                    <Highlight
                      text={m[col.key]}
                      needle={col.key === 'modelId' ? needle || f.ident.toLowerCase() : needle}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-fd-muted-foreground">
                No models match those filters.
              </td>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
