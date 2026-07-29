'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  commitIntake,
  createDraft,
  deleteDraft,
  saveDraft,
  supersedeRecord,
} from '@/lib/intake';
import { draftPayloadSchema, type DraftPayload } from '@/lib/intake-schema';

export async function startIntake(operator: string) {
  const draft = await createDraft(operator.trim() || 'unknown');
  if (!draft) throw new Error('Could not create draft');
  redirect(`/intake/${draft.id}`);
}

export type SyncResult = { ok: true; updatedAt: string } | { ok: false; error: string };

/** Called when the wizard advances a step, or on explicit save. */
export async function syncDraft(
  id: string,
  step: number,
  payload: DraftPayload,
): Promise<SyncResult> {
  const parsed = draftPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Draft payload failed validation' };

  const row = await saveDraft(id, step, parsed.data);
  if (!row) return { ok: false, error: 'Draft no longer exists — it may have been committed' };

  return { ok: true, updatedAt: row.updated_at.toISOString() };
}

export type CommitResult = { ok: true; id: number } | { ok: false; error: string };

export async function commitDraft(draftId: string, payload: unknown): Promise<CommitResult> {
  try {
    const record = await commitIntake(payload as never, draftId);
    revalidatePath('/records');
    revalidatePath('/intake');
    return { ok: true, id: record.id };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function correctRecord(payload: unknown): Promise<CommitResult> {
  try {
    const record = await supersedeRecord(payload);
    revalidatePath('/records');
    return { ok: true, id: record.id };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function discardDraft(id: string) {
  await deleteDraft(id);
  revalidatePath('/intake');
  redirect('/intake');
}

/** Turn Zod issues and Postgres constraint violations into something an operator can act on. */
function messageFor(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
      return (err as { issues: { path: (string | number)[]; message: string }[] }).issues
        .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
        .join('; ');
    }
    const code = (err as { code?: string }).code;
    // A correction already exists for this record — the chain stays linear.
    if (code === '23505') return 'That record already has a correction.';
    if (code === '23514') return 'A value failed a database constraint.';
    // Raised by the append-only triggers.
    if (code === '23001') return 'Committed records cannot be modified.';
    if ('message' in err) return String((err as { message: unknown }).message);
  }
  return 'Something went wrong committing the intake.';
}
