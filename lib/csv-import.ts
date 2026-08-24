import { parseCsv, unguardFormula } from './csv.ts';
import { FIELD_LABELS, matchHeaders, type ImportField } from './csv-columns.ts';
import {
  ACTIVATION_LOCK,
  FIRMWARE_LOCKED,
  MDM_ENROLLED,
  OS_RESET,
  commitSchema,
  type CommitInput,
} from './intake-schema.ts';

// This layer converts *formats* — units, percent signs, em-dashes, casing,
// synonyms — into the strings commitSchema already accepts. It never decides
// validity: every range, integer and required-field error still comes from
// commitSchema, so the wizard and the importer can't drift apart.

/** One transaction's worth. Bounds the blast radius of a bad file. */
export const MAX_IMPORT_ROWS = 2000;

export interface RowIssue {
  field: string;
  message: string;
}

export interface NormalizedRow {
  /** 1-based line in the file as the operator sees it, header included. */
  line: number;
  /** Kept even when the row is invalid, so duplicates still get flagged. */
  serial: string;
  cells: Partial<Record<ImportField, string>>;
  /** Parsed byte values, surfaced in the preview so unit guesses are visible. */
  ramBytes: number | null;
  hdBytes: number | null;
  input: CommitInput | null;
  issues: RowIssue[];
}

export interface ParsedImport {
  /** Header, row-cap or parse failure — the whole file is rejected, no preview. */
  fatal: string | null;
  unknownHeaders: string[];
  ignoredHeaders: string[];
  rows: NormalizedRow[];
}

// formatBytes writes an em-dash for null, so a round-trip has to read it back as
// "not provided". One helper for every field — the easiest rule to forget.
const BLANKS = new Set(['', '—', '–', '-']);

function blank(v: string | undefined): boolean {
  return v === undefined || BLANKS.has(v.trim());
}

/**
 * Same, plus "N/A". Only for fields where n/a means nothing — it's a real value
 * for Firmware Locked, so the enum path uses strict blank().
 */
function blankish(v: string | undefined): boolean {
  return blank(v) || /^n\/?a$/i.test(v!.trim());
}

const UNITS: Record<string, number> = {
  b: 0,
  k: 1,
  kb: 1,
  kib: 1,
  m: 2,
  mb: 2,
  mib: 2,
  g: 3,
  gb: 3,
  gib: 3,
  t: 4,
  tb: 4,
  tib: 4,
};

/**
 * "16 GB", "16GB", "16", "17179869184", "1 TB", "none". RAM is binary and
 * storage is marketed decimal, so the caller passes the base its column uses —
 * the same split formatBytes makes on the way out.
 */
export function parseBytes(raw: string, base: 1024 | 1000): number | null | 'invalid' {
  const v = raw.trim();
  if (v === '' || v === '—' || v === '–' || v === '-') return null;
  if (/^none$/i.test(v)) return 0;

  const m = /^([\d.,]+)\s*(b|kib?|kb|mib?|mb|gib?|gb|tib?|tb)?$/i.exec(v);
  if (!m) return 'invalid';

  // A mantissa of nothing but separators ("," or ",,") makes Number('') zero,
  // which would record a real "no drive" reading out of a mangled cell.
  const mantissa = m[1].replaceAll(',', '');
  if (!/\d/.test(mantissa)) return 'invalid';

  const n = Number(mantissa);
  if (!Number.isFinite(n) || n < 0) return 'invalid';

  const unit = m[2]?.toLowerCase();
  if (!unit) {
    // No unit is genuinely ambiguous. Anything at or above a million is a raw
    // byte count (a `sysctl -n hw.memsize` paste); anything under it is GB.
    return n >= 1_000_000 ? Math.round(n) : Math.round(n * base ** 3);
  }

  // GiB/TiB always mean 1024; GB/TB follow the column's convention.
  const unitBase = unit.includes('i') ? 1024 : base;
  return Math.round(n * unitBase ** UNITS[unit]);
}

/**
 * The documented intake sheet has one Battery column holding both readings, so
 * "94% / 247 cycles" has to come apart. One number is health; two are health
 * then cycles, in the order the sheet writes them. Anything else is ambiguous
 * and gets rejected rather than guessed.
 */
export function parseBattery(raw: string): { health?: string; cycles?: string } | 'invalid' {
  const v = raw.trim();
  if (v === '') return {};

  // Grab digit runs, keeping thousands separators inside a token ("1,024") but
  // letting a comma that separates two readings ("94, 247") end one.
  const tokens = v.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!tokens) return 'invalid';

  const clean = tokens.map((t) => t.replace(/,+$/, '').replaceAll(',', '').replace(/\.0+$/, ''));
  if (clean.length === 1) return { health: clean[0] };
  if (clean.length === 2) return { health: clean[0], cycles: clean[1] };
  return 'invalid';
}

function synonym<T extends string>(
  raw: string,
  table: Record<string, T>,
  allowed: readonly T[],
): T | null {
  const key = raw.trim().toLowerCase().replace(/\.$/, '').replace(/[\s_-]/g, '');
  if (table[key]) return table[key];
  return (allowed as readonly string[]).includes(key) ? (key as T) : null;
}

const FIRMWARE_SYNONYMS: Record<string, (typeof FIRMWARE_LOCKED)[number]> = {
  y: 'yes', true: 'yes', locked: 'yes', set: 'yes',
  n: 'no', false: 'no', unlocked: 'no',
  removed: 'cleared', clear: 'cleared',
  'n/a': 'n/a', na: 'n/a', notapplicable: 'n/a', applesilicon: 'n/a',
};

const OS_RESET_SYNONYMS: Record<string, (typeof OS_RESET)[number]> = {
  y: 'yes', true: 'yes', erased: 'yes', reinstalled: 'yes', done: 'yes',
  n: 'no', false: 'no', pending: 'no',
};

const ACTIVATION_SYNONYMS: Record<string, (typeof ACTIVATION_LOCK)[number]> = {
  on: 'enabled', locked: 'enabled', yes: 'enabled', y: 'enabled', true: 'enabled',
  off: 'disabled', no: 'disabled', n: 'disabled', false: 'disabled', clear: 'disabled',
  'n/a': 'unsupported', na: 'unsupported', pret2: 'unsupported', notsupported: 'unsupported',
  '?': 'unknown', unk: 'unknown',
};

const MDM_SYNONYMS: Record<string, (typeof MDM_ENROLLED)[number]> = {
  y: 'yes', true: 'yes', enrolled: 'yes', dep: 'yes',
  n: 'no', false: 'no', notenrolled: 'no',
  '?': 'unknown', unk: 'unknown',
};

const ENUMS = {
  firmwareLocked: { table: FIRMWARE_SYNONYMS, allowed: FIRMWARE_LOCKED },
  osReset: { table: OS_RESET_SYNONYMS, allowed: OS_RESET },
  activationLock: { table: ACTIVATION_SYNONYMS, allowed: ACTIVATION_LOCK },
  mdmEnrolled: { table: MDM_SYNONYMS, allowed: MDM_ENROLLED },
} as const;

export function normalizeCsv(text: string): ParsedImport {
  const empty = { unknownHeaders: [], ignoredHeaders: [], rows: [] };

  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (err) {
    return { fatal: err instanceof Error ? err.message : 'Could not read the file', ...empty };
  }

  if (table.length === 0) return { fatal: 'That file is empty.', ...empty };

  const [header, ...body] = table;
  const match = matchHeaders(header);

  if (match.duplicated.length > 0) {
    const names = match.duplicated.map((f) => FIELD_LABELS[f]).join(', ');
    return {
      fatal: `Two columns map to the same field (${names}). Rename or remove one — guessing which to use could write the wrong value.`,
      ...empty,
    };
  }

  if (match.missing.length > 0) {
    const names = match.missing.map((f) => FIELD_LABELS[f]).join(', ');
    return { fatal: `Missing required column${match.missing.length > 1 ? 's' : ''}: ${names}.`, ...empty };
  }

  if (body.length > MAX_IMPORT_ROWS) {
    return {
      fatal: `That file has ${body.length.toLocaleString()} rows. Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} — split it and import in batches.`,
      ...empty,
    };
  }

  const rows = body.map((cells, i) => normalizeRow(cells, match.map, header.length, i + 2));

  return {
    fatal: null,
    unknownHeaders: match.unknown,
    ignoredHeaders: match.ignored,
    rows,
  };
}

/**
 * Rows that repeat a serial already used earlier in the same file, mapped to the
 * line that used it first. The ledger check only asks the database, so without
 * this a file that repeats itself — a concatenated export, a copy-pasted row —
 * sails past the duplicate guard with every copy pre-ticked.
 *
 * Serials arrive here already uppercased by normalizeRow, matching the
 * case-insensitive findSerials lookup. Blank serials are already a row error,
 * so they're skipped rather than collapsed together.
 */
export function repeatedSerials(rows: readonly NormalizedRow[]): Map<number, number> {
  const firstSeen = new Map<string, number>();
  const repeats = new Map<number, number>();
  for (const r of rows) {
    if (r.serial === '') continue;
    const seen = firstSeen.get(r.serial);
    if (seen === undefined) firstSeen.set(r.serial, r.line);
    else repeats.set(r.line, seen);
  }
  return repeats;
}

function normalizeRow(
  cells: string[],
  map: Map<number, ImportField>,
  headerWidth: number,
  line: number,
): NormalizedRow {
  const issues: RowIssue[] = [];
  const raw: Partial<Record<ImportField, string>> = {};

  for (const [index, field] of map) {
    const cell = cells[index];
    if (cell !== undefined) raw[field] = unguardFormula(cell).trim();
  }

  // A short or long row means the columns have shifted. Never silently pad —
  // that writes one machine's serial onto another machine's readings.
  if (cells.length !== headerWidth) {
    issues.push({
      field: 'row',
      message: `has ${cells.length} field${cells.length === 1 ? '' : 's'}, expected ${headerWidth}`,
    });
  }

  const input: Record<string, unknown> = {};
  const take = (f: ImportField) => (blankish(raw[f]) ? undefined : raw[f]!.trim());
  const takeStrict = (f: ImportField) => (blank(raw[f]) ? undefined : raw[f]!.trim());

  // Empty string rather than undefined so a missing cell trips commitSchema's
  // "Serial is required" instead of Zod's raw "expected string, received undefined".
  // Uppercased here as well as in commitSchema, so duplicate detection (both the
  // in-file repeat check and the findSerials lookup) can't miss on case.
  input.serial = (take('serial') ?? '').toUpperCase();
  input.identifier = take('identifier');
  input.name = take('name');
  input.model = take('model');
  input.cpu = take('cpu');
  input.physicalIssues = take('physicalIssues');
  input.functionalIssues = take('functionalIssues');

  const year = take('year');
  if (year !== undefined) {
    // Sheets carry "Late 2013" and "2013 (Retina)" all the time.
    const found = /\b(19|20)\d{2}\b/.exec(year);
    if (found) input.year = found[0];
    else issues.push({ field: 'Year', message: 'expected a 4-digit year' });
  }

  const cycles = take('batteryCycles');
  if (cycles !== undefined) input.batteryCycles = cycles.replaceAll(',', '').trim();

  const battery = take('batteryHealth');
  if (battery !== undefined) {
    const parsed = parseBattery(battery);
    if (parsed === 'invalid') {
      issues.push({
        field: FIELD_LABELS.batteryHealth,
        message: `couldn't read "${battery}" — try "94", "94%", or "94% / 247 cycles"`,
      });
    } else {
      if (parsed.health !== undefined) input.batteryHealth = parsed.health;
      // An explicit Battery Cycles column wins over a number bundled into Battery.
      if (parsed.cycles !== undefined && input.batteryCycles === undefined) {
        input.batteryCycles = parsed.cycles;
      }
    }
  }

  const ram = parseSize(raw.ramBytes, 1024, 'RAM', issues);
  const hd = parseSize(raw.hdBytes, 1000, 'HD', issues);
  if (ram !== 'invalid' && ram !== null) input.ramBytes = ram;
  if (hd !== 'invalid' && hd !== null) input.hdBytes = hd;

  for (const key of ['firmwareLocked', 'osReset', 'activationLock', 'mdmEnrolled'] as const) {
    const value = takeStrict(key);
    const { table, allowed } = ENUMS[key];
    // Blank commits as "not recorded" and draws the locks-unverified blocker —
    // still no defaults: a value that IS provided must be a real one.
    if (value === undefined) continue;
    const canonical = synonym(value, table as Record<string, string>, allowed as readonly string[]);
    if (canonical === null) {
      issues.push({
        field: FIELD_LABELS[key],
        message: `"${value}" isn't one of ${allowed.join(', ')}`,
      });
    } else {
      input[key] = canonical;
    }
  }

  // ingestedBy is stamped from the session at commit time; commitSchema requires
  // it, so stand in a placeholder here purely to validate the rest of the row.
  const parsed = commitSchema.safeParse({ ...input, ingestedBy: 'import' });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '') as ImportField;
      const label = FIELD_LABELS[key] ?? key ?? 'value';
      // We already said something clearer about this column above — one message
      // per field, or the preview turns into a wall of restated errors.
      if (issues.some((i) => i.field === label)) continue;
      issues.push({ field: label, message: issue.message });
    }
  }

  return {
    line,
    serial: typeof input.serial === 'string' ? input.serial : '',
    cells: raw,
    ramBytes: typeof ram === 'number' ? ram : null,
    hdBytes: typeof hd === 'number' ? hd : null,
    input: issues.length === 0 ? (input as CommitInput) : null,
    issues,
  };
}

function parseSize(
  value: string | undefined,
  base: 1024 | 1000,
  label: string,
  issues: RowIssue[],
): number | null | 'invalid' {
  if (blankish(value)) return null;
  const parsed = parseBytes(value!, base);
  if (parsed === 'invalid') {
    issues.push({
      field: label,
      message: `could not read a size — try "16 GB", "512", or a raw byte count`,
    });
  }
  return parsed;
}
