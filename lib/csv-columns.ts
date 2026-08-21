import { formatBytes } from './format.ts';
// Type-only, so this module stays free of the 'server-only' import in intake.ts
// and can be unit-tested and bundled anywhere.
import type { IntakeRecord } from './intake.ts';
import { guardFormula } from './csv.ts';

/** What an import row can fill. Keys match commitSchema's input shape. */
export type ImportField =
  | 'serial'
  | 'identifier'
  | 'name'
  | 'model'
  | 'year'
  | 'cpu'
  | 'ramBytes'
  | 'hdBytes'
  | 'batteryHealth'
  | 'batteryCycles'
  | 'physicalIssues'
  | 'functionalIssues'
  | 'firmwareLocked'
  | 'osReset'
  | 'activationLock'
  | 'mdmEnrolled';

/**
 * The sheet order from the README, with Battery split into the two columns the
 * DB actually has, the two lock columns inserted where Step 8 collects them, the
 * record id first, and the audit-only columns last.
 */
export const EXPORT_HEADERS = [
  'Record #',
  'Name',
  'Serial',
  'Identifier',
  'Model',
  'Battery Health',
  'Battery Cycles',
  'Year',
  'RAM',
  'HD',
  'CPU',
  'Physical Issues',
  'Functional Issues',
  'Firmware Locked',
  'OS Reset',
  'Activation Lock',
  'MDM Enrolled',
  'Processed At',
  'Ingested By',
  'Blockers',
  'Supersedes',
  'Correction Note',
] as const;

/**
 * Export minus everything the importer discards — no point inviting an operator
 * to fill a column the server throws away.
 */
export const TEMPLATE_HEADERS = EXPORT_HEADERS.filter(
  (h) =>
    ![
      'Record #',
      'Processed At',
      'Ingested By',
      'Blockers',
      'Supersedes',
      'Correction Note',
    ].includes(h),
);

/** commitSchema makes these six mandatory, so a file without them has no usable row. */
export const REQUIRED_FIELDS: readonly ImportField[] = [
  'serial',
  'identifier',
  'firmwareLocked',
  'osReset',
  'activationLock',
  'mdmEnrolled',
];

/** Strips punctuation and case so "Ingested By", "ingested_by" and "INGESTED-BY" all collapse. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES: Record<string, ImportField> = {
  serial: 'serial',
  serialnumber: 'serial',
  identifier: 'identifier',
  modelidentifier: 'identifier',
  hwmodel: 'identifier',
  name: 'name',
  marketingname: 'name',
  family: 'name',
  model: 'model',
  anumber: 'model',
  modelanumber: 'model',
  modelnumber: 'model',
  year: 'year',
  cpu: 'cpu',
  processor: 'cpu',
  chip: 'cpu',
  ram: 'ramBytes',
  rambytes: 'ramBytes',
  memory: 'ramBytes',
  hd: 'hdBytes',
  hdbytes: 'hdBytes',
  storage: 'hdBytes',
  disk: 'hdBytes',
  ssd: 'hdBytes',
  battery: 'batteryHealth',
  batteryhealth: 'batteryHealth',
  health: 'batteryHealth',
  batterycycles: 'batteryCycles',
  cycles: 'batteryCycles',
  cyclecount: 'batteryCycles',
  physicalissues: 'physicalIssues',
  physical: 'physicalIssues',
  functionalissues: 'functionalIssues',
  functional: 'functionalIssues',
  firmwarelocked: 'firmwareLocked',
  firmware: 'firmwareLocked',
  firmwarepassword: 'firmwareLocked',
  osreset: 'osReset',
  reset: 'osReset',
  erased: 'osReset',
  activationlock: 'activationLock',
  activation: 'activationLock',
  mdmenrolled: 'mdmEnrolled',
  mdm: 'mdmEnrolled',
  dep: 'mdmEnrolled',
  depmdm: 'mdmEnrolled',
  mdmdep: 'mdmEnrolled',
};

/**
 * Columns we recognise and deliberately drop. Provenance and audit values are
 * stamped server-side, and Record # exists so a round-tripped export can't be
 * mistaken for an upsert key.
 */
const IGNORED = new Set([
  'record',
  'recordnumber',
  'id',
  'processedat',
  'processed',
  'ingestedby',
  'by',
  'operator',
  'blockers',
  'locks',
  'supersedes',
  'supersedesid',
  'correctionnote',
  'note',
]);

export interface HeaderMatch {
  /** column index -> field */
  map: Map<number, ImportField>;
  unknown: string[];
  ignored: string[];
  missing: ImportField[];
  duplicated: ImportField[];
}

export function matchHeaders(header: readonly string[]): HeaderMatch {
  const map = new Map<number, ImportField>();
  const seen = new Map<ImportField, number>();
  const unknown: string[] = [];
  const ignored: string[] = [];
  const duplicated: ImportField[] = [];

  header.forEach((raw, i) => {
    const key = normalizeHeader(raw);
    if (key === '') return;
    const field = ALIASES[key];
    if (field) {
      if (seen.has(field)) {
        if (!duplicated.includes(field)) duplicated.push(field);
        return;
      }
      seen.set(field, i);
      map.set(i, field);
    } else if (IGNORED.has(key)) {
      ignored.push(raw.trim());
    } else {
      unknown.push(raw.trim());
    }
  });

  const missing = REQUIRED_FIELDS.filter((f) => !seen.has(f));
  return { map, unknown, ignored, missing, duplicated };
}

/** Column name to show in error text, so messages name what the operator typed. */
export const FIELD_LABELS: Record<ImportField, string> = {
  serial: 'Serial',
  identifier: 'Identifier',
  name: 'Name',
  model: 'Model',
  year: 'Year',
  cpu: 'CPU',
  ramBytes: 'RAM',
  hdBytes: 'HD',
  batteryHealth: 'Battery Health',
  batteryCycles: 'Battery Cycles',
  physicalIssues: 'Physical Issues',
  functionalIssues: 'Functional Issues',
  firmwareLocked: 'Firmware Locked',
  osReset: 'OS Reset',
  activationLock: 'Activation Lock',
  mdmEnrolled: 'MDM Enrolled',
};

/** One export row, EXPORT_HEADERS order. Free text is formula-guarded. */
export function recordToCsvRow(r: IntakeRecord): string[] {
  const text = (v: string | null) => (v === null ? '' : guardFormula(v));
  const num = (v: number | null) => (v === null ? '—' : String(v));
  return [
    String(r.id),
    text(r.name),
    text(r.serial),
    text(r.identifier),
    text(r.model),
    r.battery_health === null ? '—' : String(r.battery_health),
    num(r.battery_cycles),
    num(r.year),
    formatBytes(r.ram_bytes, 1024),
    formatBytes(r.hd_bytes, 1000),
    text(r.cpu),
    text(r.physical_issues),
    text(r.functional_issues),
    r.firmware_locked,
    r.os_reset,
    r.activation_lock,
    r.mdm_enrolled,
    new Date(r.processed_at).toISOString(),
    text(r.ingested_by),
    r.blockers.join('; '),
    r.supersedes_id === null ? '' : String(r.supersedes_id),
    text(r.correction_note),
  ];
}
