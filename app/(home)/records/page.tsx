import Link from 'next/link';
import type { Metadata } from 'next';
import { listAllRecords } from '@/lib/intake';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Records' };

const BLOCKER_LABELS: Record<string, string> = {
  'activation-lock': 'Activation Lock',
  'mdm-enrolled': 'DEP/MDM',
  'firmware-locked': 'Firmware',
  'smart-failing': 'SMART failing',
};

function gb(bytes: string | null, base: 1024 | 1000) {
  if (bytes === null) return '—';
  const n = Number(bytes);
  if (n === 0) return 'None';
  if (base === 1000 && n >= 1000 ** 4) return `${n / 1000 ** 4} TB`;
  return `${Math.round(n / base ** 3)} GB`;
}

export default async function RecordsPage(props: PageProps<'/records'>) {
  const { committed } = await props.searchParams;
  const records = await listAllRecords();
  const supersededIds = new Set(records.map((r) => r.supersedes_id).filter(Boolean));

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake Records</h1>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            Append-only. Rows are never edited or deleted — a correction is a new row that
            supersedes the original, and both stay.
          </p>
        </div>
        <Link
          href="/intake"
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          New intake
        </Link>
      </div>

      {committed && (
        <p className="mt-4 rounded-lg border border-fd-primary/40 bg-fd-primary/10 px-3 py-2 text-sm">
          Committed as record #{committed}.
        </p>
      )}

      {records.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-fd-border px-4 py-10 text-center text-sm text-fd-muted-foreground">
          Nothing committed yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-fd-border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-fd-border bg-fd-card text-left">
                {['#', 'Name', 'Serial', 'Identifier', 'Model', 'Year', 'RAM', 'HD', 'Battery', 'Locks', 'Processed', 'By'].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const superseded = supersededIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-fd-border/60 last:border-0 ${
                      superseded ? 'text-fd-muted-foreground' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {r.id}
                      {superseded && (
                        <span
                          className="ml-1.5 rounded bg-fd-secondary px-1.5 py-0.5 text-[10px] uppercase"
                          title="A later record corrects this one"
                        >
                          superseded
                        </span>
                      )}
                      {r.supersedes_id && (
                        <span
                          className="ml-1.5 rounded bg-fd-secondary px-1.5 py-0.5 text-[10px] uppercase"
                          title={r.correction_note ?? undefined}
                        >
                          corrects #{r.supersedes_id}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{r.name ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{r.serial}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{r.identifier}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.model ?? '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.year ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{gb(r.ram_bytes, 1024)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{gb(r.hd_bytes, 1000)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {r.battery_health === null ? '—' : `${r.battery_health}%`}
                      {r.battery_cycles !== null && (
                        <span className="text-fd-muted-foreground"> · {r.battery_cycles}c</span>
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
                              {BLOCKER_LABELS[b] ?? b}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {new Date(r.processed_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.ingested_by}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
