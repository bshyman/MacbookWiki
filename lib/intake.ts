import 'server-only';
import { getPool, query, queryOne } from './db';
import {
  commitSchema,
  correctionSchema,
  deriveBlockers,
  type CommitInput,
  type DraftPayload,
} from './intake-schema';

export interface IntakeRecord {
  id: number;
  serial: string;
  // Everything below the serial is nullable: broken machines can't produce
  // readings, and "not recorded" beats keeping them out of the ledger.
  identifier: string | null;
  name: string | null;
  model: string | null;
  year: number | null;
  cpu: string | null;
  ram_bytes: number | null;
  hd_bytes: number | null;
  battery_health: number | null;
  battery_cycles: number | null;
  physical_issues: string | null;
  functional_issues: string | null;
  firmware_locked: string | null;
  os_reset: string | null;
  activation_lock: string | null;
  mdm_enrolled: string | null;
  blockers: string[];
  processed_at: Date;
  ingested_by: string;
  supersedes_id: number | null;
  correction_note: string | null;
}

/** A ledger row plus its archive marker, for queries that join intake_archived. */
export interface ArchivedRecord extends IntakeRecord {
  archived_at: Date | null;
  archived_by: string | null;
}

export interface IntakeDraft {
  id: string;
  step: number;
  payload: DraftPayload;
  serial: string | null;
  identifier: string | null;
  started_by: string;
  created_at: Date;
  updated_at: Date;
}

// ------------------------------------------------------------------ drafts ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Draft ids are uuids. Postgres raises 22P02 on anything else, which surfaces as
 * a 500 — so callers check first and 404 instead.
 */
export function isDraftId(value: string): boolean {
  return UUID_RE.test(value);
}

export function createDraft(startedBy: string) {
  return queryOne<IntakeDraft>(
    `INSERT INTO intake_drafts (started_by) VALUES ($1) RETURNING *`,
    [startedBy],
  );
}

export function loadDraft(id: string) {
  return queryOne<IntakeDraft>(`SELECT * FROM intake_drafts WHERE id = $1`, [id]);
}

export function listDrafts(limit = 50) {
  return query<IntakeDraft>(
    `SELECT * FROM intake_drafts ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
}

/**
 * Every draft id, uncapped — the localStorage pruner treats anything not in this
 * set as an orphan, so a capped list would eat live drafts' crash-recovery copies.
 */
export async function listDraftIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(`SELECT id FROM intake_drafts`);
  return rows.map((r) => r.id);
}

/**
 * Whole-payload write. The wizard keeps the authoritative copy in local state and
 * syncs on step change, so last-write-wins is the intended behaviour — one
 * operator per draft, no concurrent editors to merge.
 */
export function saveDraft(id: string, step: number, payload: DraftPayload) {
  return queryOne<IntakeDraft>(
    `UPDATE intake_drafts
        SET step = $2,
            payload = $3::jsonb,
            serial = NULLIF(btrim($3::jsonb ->> 'serial'), ''),
            identifier = NULLIF(btrim($3::jsonb ->> 'identifier'), '')
      WHERE id = $1
      RETURNING *`,
    [id, step, JSON.stringify(payload)],
  );
}

export async function deleteDraft(id: string) {
  await query(`DELETE FROM intake_drafts WHERE id = $1`, [id]);
}

// ----------------------------------------------------------------- records ---

const INSERT_COLUMNS = `
  serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
  battery_health, battery_cycles, physical_issues, functional_issues,
  firmware_locked, os_reset, activation_lock, mdm_enrolled, blockers, ingested_by`;

/** How many rows the records page loads. The export route ignores it. */
export const RECORDS_LIMIT = 1000;

/**
 * Rows per INSERT statement on a bulk import. The ceiling is 65535 bind params
 * over 18 columns (~3640 rows); 500 sits well clear and keeps the statement text
 * small enough to stay readable in a slow-query log.
 */
const BULK_BATCH_ROWS = 500;

function insertValues(v: ReturnType<typeof commitSchema.parse>, blockers: string[]) {
  return [
    v.serial, v.identifier, v.name, v.model, v.year, v.cpu, v.ramBytes, v.hdBytes,
    v.batteryHealth, v.batteryCycles, v.physicalIssues, v.functionalIssues,
    v.firmwareLocked, v.osReset, v.activationLock, v.mdmEnrolled, blockers, v.ingestedBy,
  ];
}

/**
 * Commit a draft to the ledger and drop the draft. Both in one transaction so a
 * failure can't leave a committed record with an orphaned draft still editable.
 */
export async function commitIntake(input: CommitInput, draftId?: string) {
  const values = commitSchema.parse(input);
  const blockers = deriveBlockers(values);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO intake_records (${INSERT_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      insertValues(values, blockers),
    );
    if (draftId) await client.query(`DELETE FROM intake_drafts WHERE id = $1`, [draftId]);
    await client.query('COMMIT');
    return rows[0] as IntakeRecord;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Correct a committed record. The original is never touched — this writes a new
 * row pointing back at it. A unique partial index keeps the chain linear, so a
 * second correction off the same row is rejected by the database.
 */
export async function supersedeRecord(input: unknown) {
  const v = correctionSchema.parse(input);
  const blockers = deriveBlockers(v);

  const row = await queryOne<IntakeRecord>(
    `INSERT INTO intake_records (${INSERT_COLUMNS}, supersedes_id, correction_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [...insertValues(v, blockers), v.supersedesId, v.correctionNote],
  );
  return row!;
}

/**
 * Bulk commit from a CSV import. One transaction for the whole file: the ledger
 * has no DELETE, so ROLLBACK is the only undo that exists — a half-landed import
 * would be permanent. Validation runs before BEGIN so a bad row never opens one.
 */
export async function bulkCommitIntake(inputs: CommitInput[], operator: string) {
  // Attribution is stamped here as well as in the action — lib/intake.ts is the
  // boundary, and every caller crosses it the same way.
  const rows = inputs.map((input) => commitSchema.parse({ ...input, ingestedBy: operator }));
  if (rows.length === 0) return { ids: [] as number[] };

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const ids: number[] = [];
    for (let start = 0; start < rows.length; start += BULK_BATCH_ROWS) {
      const batch = rows.slice(start, start + BULK_BATCH_ROWS);
      const params: unknown[] = [];
      const tuples = batch.map((v) => {
        const values = insertValues(v, deriveBlockers(v));
        const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
        params.push(...values);
        return `(${placeholders.join(',')})`;
      });
      const { rows: inserted } = await client.query<{ id: number }>(
        `INSERT INTO intake_records (${INSERT_COLUMNS}) VALUES ${tuples.join(',')} RETURNING id`,
        params,
      );
      ids.push(...inserted.map((r) => r.id));
    }
    await client.query('COMMIT');
    return { ids };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Current truth — superseded rows excluded. */
export function listCurrentRecords(limit = 200) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_current ORDER BY processed_at DESC LIMIT $1`,
    [limit],
  );
}

/** Full ledger including superseded and archived rows, for audit. */
export function listAllRecords(limit = RECORDS_LIMIT) {
  return query<ArchivedRecord>(
    `SELECT r.*, a.archived_at, a.archived_by
       FROM intake_records r
       LEFT JOIN intake_archived a ON a.record_id = r.id
      ORDER BY r.id DESC LIMIT $1`,
    [limit],
  );
}

/** So the page can say how much of the ledger it's actually showing. */
export async function countAllRecords(): Promise<number> {
  const row = await queryOne<{ count: number }>(`SELECT count(*)::int AS count FROM intake_records`);
  return row?.count ?? 0;
}

export async function maxRecordId(): Promise<number | null> {
  const row = await queryOne<{ max: number | null }>(`SELECT max(id) AS max FROM intake_records`);
  return row?.max ?? null;
}

/**
 * One page of a descending keyset walk, for the CSV export. Ids are monotonic
 * and rows are never deleted, so paging down by id is a consistent snapshot
 * without holding a transaction — anything inserted mid-export sorts above the
 * starting cursor and simply doesn't appear.
 *
 * Archived rows are filtered in the WHERE, not after, so a page still comes back
 * full and the caller's "short page means done" check stays correct. Ticking
 * archived rows in the table and using the selection export still gets them out.
 */
export function recordsPage(beforeId: number, limit: number) {
  return query<IntakeRecord>(
    `SELECT r.* FROM intake_records r
      WHERE r.id < $1
        AND NOT EXISTS (SELECT 1 FROM intake_archived a WHERE a.record_id = r.id)
      ORDER BY r.id DESC LIMIT $2`,
    [beforeId, limit],
  );
}

/**
 * One chunk of a selection export. The caller already holds the full id list, so
 * it slices rather than walking a cursor — no ORDER BY drift between chunks, and
 * ids that no longer exist just come back short.
 */
export function recordsByIds(ids: number[]) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_records WHERE id = ANY($1::int[]) ORDER BY id DESC`,
    [ids],
  );
}

// ----------------------------------------------------------------- archive ---

/**
 * Mark a record archived. Idempotent — archiving an already-archived record is
 * a no-op rather than an error, so a double-submit doesn't surface as one.
 * Returns null in that case.
 */
export function archiveRecord(id: number, by: string, reason: string | null) {
  return queryOne<{ record_id: number }>(
    `INSERT INTO intake_archived (record_id, archived_by, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (record_id) DO NOTHING
     RETURNING record_id`,
    [id, by, reason],
  );
}

/** Drop the marker. Deletes from intake_archived only — never from the ledger. */
export function unarchiveRecord(id: number) {
  return queryOne<{ record_id: number }>(
    `DELETE FROM intake_archived WHERE record_id = $1 RETURNING record_id`,
    [id],
  );
}

/**
 * Which of these serials are already live in the ledger, and as which records.
 *
 * Reads intake_current, not intake_records: an archived serial has to stop
 * counting as a duplicate or you could never re-import a file after archiving
 * the bad version of it. Superseded rows drop out for the same reason — the
 * answer should be the record that's true now, not every version of it.
 *
 * Case-insensitive, keyed by uppercased serial: two ledger rows predate the
 * uppercase-at-commit rule, and a case miss here silently doubles a machine.
 */
export async function findSerials(serials: string[]): Promise<Map<string, number[]>> {
  const found = new Map<string, number[]>();
  if (serials.length === 0) return found;
  const rows = await query<{ id: number; serial: string }>(
    `SELECT id, serial FROM intake_current WHERE upper(serial) = ANY($1::text[]) ORDER BY id`,
    [serials.map((s) => s.toUpperCase())],
  );
  for (const r of rows) {
    const key = r.serial.toUpperCase();
    const list = found.get(key);
    if (list) list.push(r.id);
    else found.set(key, [r.id]);
  }
  return found;
}

export function getRecord(id: number) {
  return queryOne<IntakeRecord>(`SELECT * FROM intake_records WHERE id = $1`, [id]);
}

/**
 * The correction that replaced this record, if any. Hits idx_intake_records_supersedes —
 * scanning a capped listAllRecords() misses successors once the ledger outgrows the limit.
 */
export function successorOf(id: number) {
  return queryOne<IntakeRecord>(`SELECT * FROM intake_records WHERE supersedes_id = $1`, [id]);
}

/** Has this machine been through intake before? Case-insensitive — see findSerials. */
export function historyForSerial(serial: string) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_records WHERE upper(serial) = upper($1) ORDER BY id DESC`,
    [serial],
  );
}

/**
 * How much bench work is sitting outside the ledger. The records page shows
 * this so a finished-looking draft can't quietly stand in for a committed
 * record — that gap once grew to 31 machines before anyone saw it.
 */
export async function draftsSummary(): Promise<{ count: number; oldest: Date | null }> {
  const row = await queryOne<{ count: number; oldest: Date | null }>(
    `SELECT count(*)::int AS count, min(updated_at) AS oldest FROM intake_drafts`,
  );
  return row ?? { count: 0, oldest: null };
}
