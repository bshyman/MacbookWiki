'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  commitIntake,
  createDraft,
  deleteDraft,
  isDraftId,
  saveDraft,
  supersedeRecord,
} from '@/lib/intake';
import { draftPayloadSchema, type DraftPayload } from '@/lib/intake-schema';
import { MAX_STEP } from '@/lib/intake-steps';
import { getSession, requireSession } from '@/lib/session';

/** Client-supplied payloads are `unknown`; spreading a non-object would corrupt them. */
function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export async function startIntake() {
  const { operator } = await requireSession();
  const draft = await createDraft(operator);
  if (!draft) throw new Error('Could not create draft');
  redirect(`/intake/${draft.id}`);
}

export type SyncResult = { ok: true; updatedAt: string } | { ok: false; error: string };

/**
 * Called when the wizard advances a step, or on explicit save. Returns an error
 * rather than redirecting on an expired session — this fires in the background
 * while someone is typing, and yanking them to /signin mid-field would lose the
 * unsynced fields. The local copy survives, and the badge says so.
 */
export async function syncDraft(
  id: string,
  step: number,
  payload: DraftPayload,
): Promise<SyncResult> {
  if (!(await getSession())) {
    return { ok: false, error: 'Session expired — sign in again to resume syncing' };
  }

  if (!isDraftId(id)) return { ok: false, error: 'Not a valid draft id' };

  const parsed = draftPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Draft payload failed validation' };

  // Never send a step the CHECK constraint would reject — a throw here used to
  // strand the wizard rather than surface an error.
  const safeStep = Math.min(Math.max(Math.trunc(step), 1), MAX_STEP);

  try {
    const row = await saveDraft(id, safeStep, parsed.data);
    if (!row) return { ok: false, error: 'Draft no longer exists — it may have been committed' };
    return { ok: true, updatedAt: row.updated_at.toISOString() };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export type CommitResult = { ok: true; id: number } | { ok: false; error: string };

export async function commitDraft(draftId: string, payload: unknown): Promise<CommitResult> {
  // Attribution comes from the session, never from the client. The operator can't
  // put someone else's name on a row they can't afterwards delete.
  const { operator } = await requireSession();
  // A bad id would 22P02 on the draft DELETE and roll back an otherwise-valid insert.
  if (!isDraftId(draftId)) return { ok: false, error: 'Not a valid draft id' };
  try {
    const record = await commitIntake(
      { ...asObject(payload), ingestedBy: operator } as never,
      draftId,
    );
    revalidatePath('/records');
    revalidatePath('/intake');
    return { ok: true, id: record.id };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function correctRecord(payload: unknown): Promise<CommitResult> {
  // A correction is attributed to whoever filed it, not to the original operator.
  const { operator } = await requireSession();
  try {
    const record = await supersedeRecord({ ...asObject(payload), ingestedBy: operator });
    revalidatePath('/records');
    return { ok: true, id: record.id };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function discardDraft(id: string) {
  await requireSession();
  if (!isDraftId(id)) redirect('/intake');
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
  }
  // Anything else is a server problem — pg errors and network failures name
  // internal hosts, so the text stays out of the client. Log it here instead.
  console.error('intake action failed:', err);
  return 'Something went wrong writing to the database.';
}
