'use server';

import { revalidatePath } from 'next/cache';
import { messageFor } from '@/lib/action-errors';
import { archiveRecord, unarchiveRecord } from '@/lib/intake';
import { requireSession } from '@/lib/session';

export type ArchiveResult = { ok: true } | { ok: false; error: string };

/** Ids come from the client, so anything can be in them. */
function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Archive hides a record from intake_current — the records list, the export and
 * the import duplicate check. The ledger row itself is untouched and stays
 * visible under the full-ledger view.
 */
export async function archive(id: number, reason: string): Promise<ArchiveResult> {
  const session = await requireSession();
  if (!validId(id)) return { ok: false, error: 'That record id is not valid.' };

  try {
    const note = reason.trim();
    await archiveRecord(id, session.operator, note === '' ? null : note);
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }

  revalidatePath('/records');
  return { ok: true };
}

export async function restore(id: number): Promise<ArchiveResult> {
  await requireSession();
  if (!validId(id)) return { ok: false, error: 'That record id is not valid.' };

  try {
    await unarchiveRecord(id);
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }

  revalidatePath('/records');
  return { ok: true };
}
