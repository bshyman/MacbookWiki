import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getRecord, successorOf } from '@/lib/intake';
import { requireSession } from '@/lib/session';
import type { DraftPayload } from '@/lib/intake-schema';
import { CorrectionForm } from '@/components/correction-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'File a correction' };

/** DB row (snake_case, bigints as strings) → the shape the shared form fields expect. */
function toPayload(r: Awaited<ReturnType<typeof getRecord>>): DraftPayload {
  if (!r) return {};
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    serial: r.serial,
    identifier: str(r.identifier),
    name: str(r.name),
    model: str(r.model),
    year: str(r.year),
    cpu: str(r.cpu),
    ramBytes: str(r.ram_bytes),
    hdBytes: str(r.hd_bytes),
    batteryHealth: str(r.battery_health),
    batteryCycles: str(r.battery_cycles),
    physicalIssues: str(r.physical_issues),
    functionalIssues: str(r.functional_issues),
    firmwareLocked: r.firmware_locked as DraftPayload['firmwareLocked'],
    osReset: r.os_reset as DraftPayload['osReset'],
    activationLock: r.activation_lock as DraftPayload['activationLock'],
    mdmEnrolled: r.mdm_enrolled as DraftPayload['mdmEnrolled'],
    ingestedBy: r.ingested_by,
  };
}

export default async function CorrectPage(props: PageProps<'/records/[id]/correct'>) {
  const { id } = await props.params;
  await requireSession();
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId < 1) notFound();

  const record = await getRecord(recordId);
  if (!record) notFound();

  // The unique partial index on supersedes_id would reject a second correction —
  // catch it here so the operator gets a route, not a constraint error.
  const successor = await successorOf(recordId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link href="/records" className="text-sm text-fd-primary underline underline-offset-2">
          ← Records
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">File a correction</h1>
      </div>

      {successor ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p>
            Record #{recordId} has already been corrected by{' '}
            <strong>#{successor.id}</strong>, so it can&apos;t be corrected again — that would
            branch the history.
          </p>
          {successor.correction_note && (
            <p className="mt-2 text-fd-muted-foreground">
              Reason given: “{successor.correction_note}”
            </p>
          )}
          <Link
            href={`/records/${successor.id}/correct`}
            className="mt-3 inline-block text-fd-primary underline underline-offset-2"
          >
            Correct #{successor.id} instead →
          </Link>
        </div>
      ) : (
        <CorrectionForm
          recordId={recordId}
          original={toPayload(record)}
          serial={record.serial}
        />
      )}
    </main>
  );
}
