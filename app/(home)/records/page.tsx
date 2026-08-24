import Link from 'next/link';
import type { Metadata } from 'next';
import { RecordsTable, type RecordRow } from '@/components/records-table';
import { formatBytes } from '@/lib/format';
import { RECORDS_LIMIT, countAllRecords, draftsSummary, listAllRecords } from '@/lib/intake';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Records' };

/** Query-string values, so anything can be in them — only show a real number. */
function positiveInt(value: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function RecordsPage(props: PageProps<'/records'>) {
  const { committed, imported } = await props.searchParams;
  await requireSession();

  const committedId = positiveInt(committed);
  const importedCount = positiveInt(imported);

  const [records, total, drafts] = await Promise.all([
    listAllRecords(),
    countAllRecords(),
    draftsSummary(),
  ]);
  const supersededIds = new Set(records.map((r) => r.supersedes_id).filter(Boolean));

  // Flatten here so the client component never sees a Date. Timestamps render in
  // UTC rather than a locale — the old page formatted with the *server's* locale,
  // which is both wrong for an audit ledger and a hydration mismatch.
  const rows: RecordRow[] = records.map((r) => ({
    id: r.id,
    serial: r.serial,
    identifier: r.identifier,
    name: r.name,
    model: r.model,
    cpu: r.cpu,
    year: r.year,
    ramBytes: r.ram_bytes,
    hdBytes: r.hd_bytes,
    ram: formatBytes(r.ram_bytes, 1024),
    hd: formatBytes(r.hd_bytes, 1000),
    batteryHealth: r.battery_health,
    batteryCycles: r.battery_cycles,
    blockers: r.blockers,
    physicalIssues: r.physical_issues,
    functionalIssues: r.functional_issues,
    processedAt: `${r.processed_at.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    processedAtIso: r.processed_at.toISOString(),
    ingestedBy: r.ingested_by,
    supersedesId: r.supersedes_id,
    correctionNote: r.correction_note,
    superseded: supersededIds.has(r.id),
    archived: r.archived_at !== null,
    archivedBy: r.archived_by,
  }));

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake Records</h1>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            Append-only. Rows are never edited or deleted — a correction is a new row that
            supersedes the original, and both stay. Archiving hides a record from this list
            and the export without removing it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/records/export"
            className="rounded-lg border border-fd-border px-4 py-2 text-sm"
          >
            Export CSV
          </a>
          <Link
            href="/records/import"
            className="rounded-lg border border-fd-border px-4 py-2 text-sm"
          >
            Import CSV
          </Link>
          <Link
            href="/intake"
            className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
          >
            New intake
          </Link>
        </div>
      </div>

      {/* Bench-complete is not ledger-complete — 31 machines once sat here
          invisibly. Keep the gap on the page people actually search. */}
      {drafts.count > 0 && (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {drafts.count.toLocaleString()} intake draft{drafts.count === 1 ? ' is' : 's are'} not
          in the ledger yet
          {drafts.oldest && (
            <> — oldest untouched since {drafts.oldest.toISOString().slice(0, 10)}</>
          )}
          . Serial searches here will not find those machines until they are committed.{' '}
          <Link href="/intake" className="underline underline-offset-2">
            Finish them in Intake
          </Link>
          .
        </p>
      )}

      {committedId !== null && (
        <p className="mt-4 rounded-lg border border-fd-primary/40 bg-fd-primary/10 px-3 py-2 text-sm">
          Committed as record #{committedId}.
        </p>
      )}

      {importedCount !== null && (
        <p className="mt-4 rounded-lg border border-fd-primary/40 bg-fd-primary/10 px-3 py-2 text-sm">
          Imported {importedCount.toLocaleString()} record{importedCount === 1 ? '' : 's'}.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-fd-border px-4 py-10 text-center text-sm text-fd-muted-foreground">
          Nothing committed yet.
        </p>
      ) : (
        <RecordsTable rows={rows} total={total} limit={RECORDS_LIMIT} />
      )}
    </main>
  );
}
