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
  identifier: string;
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
  firmware_locked: string;
  os_reset: string;
  activation_lock: string;
  mdm_enrolled: string;
  blockers: string[];
  processed_at: Date;
  ingested_by: string;
  supersedes_id: number | null;
  correction_note: string | null;
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

/** Current truth — superseded rows excluded. */
export function listCurrentRecords(limit = 200) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_current ORDER BY processed_at DESC LIMIT $1`,
    [limit],
  );
}

/** Full ledger including superseded rows, for audit. */
export function listAllRecords(limit = 200) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_records ORDER BY id DESC LIMIT $1`,
    [limit],
  );
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

/** Has this machine been through intake before? */
export function historyForSerial(serial: string) {
  return query<IntakeRecord>(
    `SELECT * FROM intake_records WHERE serial = $1 ORDER BY id DESC`,
    [serial],
  );
}
