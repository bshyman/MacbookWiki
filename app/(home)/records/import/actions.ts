'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { messageFor } from '@/lib/action-errors';
import { MAX_IMPORT_ROWS, normalizeCsv, repeatedSerials, type RowIssue } from '@/lib/csv-import';
import type { ImportField } from '@/lib/csv-columns';
import { bulkCommitIntake, findSerials } from '@/lib/intake';
import { requireSession } from '@/lib/session';

export interface PreviewRow {
  line: number;
  cells: Partial<Record<ImportField, string>>;
  ramBytes: number | null;
  hdBytes: number | null;
  issues: RowIssue[];
  /** Existing record ids with this serial. Non-empty means it's already in the ledger. */
  duplicateOf: number[];
  /** Earlier line in this same file carrying the same serial, if any. */
  repeatOfLine: number | null;
}

export type PreviewResult =
  | {
      ok: true;
      csvHash: string;
      unknownHeaders: string[];
      ignoredHeaders: string[];
      rows: PreviewRow[];
      validCount: number;
      duplicateCount: number;
    }
  | { ok: false; error: string };

export async function previewImport(csvText: string): Promise<PreviewResult> {
  await requireSession();

  const parsed = normalizeCsv(csvText);
  if (parsed.fatal) return { ok: false, error: parsed.fatal };

  let existing = new Map<string, number[]>();
  try {
    const serials = [...new Set(parsed.rows.map((r) => r.serial).filter(Boolean))];
    existing = await findSerials(serials);
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }

  // A serial can be a duplicate two ways: already in the ledger, or repeated
  // earlier in this same file. Both land unticked — the database check alone
  // waves through a file that repeats itself.
  const repeats = repeatedSerials(parsed.rows);

  const rows: PreviewRow[] = parsed.rows.map((r) => ({
    line: r.line,
    cells: r.cells,
    ramBytes: r.ramBytes,
    hdBytes: r.hdBytes,
    issues: r.issues,
    duplicateOf: existing.get(r.serial) ?? [],
    repeatOfLine: repeats.get(r.line) ?? null,
  }));

  return {
    ok: true,
    csvHash: hash(csvText),
    unknownHeaders: parsed.unknownHeaders,
    ignoredHeaders: parsed.ignoredHeaders,
    rows,
    validCount: rows.filter((r) => r.issues.length === 0).length,
    duplicateCount: rows.filter((r) => r.duplicateOf.length > 0 || r.repeatOfLine !== null).length,
  };
}

export type ImportResult = { ok: true; inserted: number } | { ok: false; error: string };

/**
 * Re-parses the file from scratch rather than trusting row objects from the
 * client: preview and commit then run identical code, so what the operator
 * confirmed is provably what lands. The hash pins it to *that* file — otherwise
 * you could review preview A and commit file B.
 */
export async function commitImport(
  csvText: string,
  csvHash: string,
  includedLines: number[],
): Promise<ImportResult> {
  const { operator } = await requireSession();

  if (hash(csvText) !== csvHash) {
    return { ok: false, error: 'The file changed since the preview. Upload it again.' };
  }

  const parsed = normalizeCsv(csvText);
  if (parsed.fatal) return { ok: false, error: parsed.fatal };

  const wanted = new Set(includedLines.filter((n) => Number.isInteger(n)));
  const chosen = parsed.rows.filter((r) => wanted.has(r.line));

  if (chosen.length === 0) return { ok: false, error: 'No rows were selected.' };
  if (chosen.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} rows.` };
  }

  // Backstop — the hash should already have caught a swapped file.
  const bad = chosen.filter((r) => !r.input);
  if (bad.length > 0) {
    return {
      ok: false,
      error: `Row${bad.length > 1 ? 's' : ''} ${bad.map((r) => r.line).join(', ')} still ${
        bad.length > 1 ? 'have' : 'has'
      } errors. Re-upload the file.`,
    };
  }

  try {
    const { ids } = await bulkCommitIntake(
      chosen.map((r) => r.input!),
      operator,
    );
    revalidatePath('/records');
    return { ok: true, inserted: ids.length };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
