import { z } from 'zod';

// Mirrors the intake sheet columns. The DB enforces the same shapes via CHECK
// constraints — this catches bad input before it becomes a failed INSERT, and
// gives the wizard per-field errors.

export const FIRMWARE_LOCKED = ['yes', 'no', 'cleared', 'n/a'] as const;
export const OS_RESET = ['yes', 'no'] as const;
export const ACTIVATION_LOCK = ['enabled', 'disabled', 'unsupported', 'unknown'] as const;
export const MDM_ENROLLED = ['yes', 'no', 'unknown'] as const;

/**
 * Blank strings from empty form inputs should read as "not provided". Accepts
 * undefined too — a key the operator never touched is absent, not invalid.
 */
// .nullish() rather than a z.undefined() union member — Zod treats object fields
// as non-optional unless the field schema itself is, so a union containing
// undefined still rejects a missing key.
const optionalText = z
  .string()
  .nullish()
  .transform((v) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t === '' ? null : t;
  });

const optionalInt = (min: number, max: number, message?: string) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      // Trim before the blank check — Number('  ') is 0, which would sail through
      // as a real reading.
      const t = typeof v === 'string' ? v.trim() : v;
      return t === '' ? null : Number(t);
    })
    // Integer, not just finite — these land in integer columns, and a 94.5
    // battery reading has to fail here with a field error, not as a 22P02 at
    // commit after the operator filled in everything else.
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), {
      message: message ?? `must be a whole number between ${min} and ${max}`,
    });

/**
 * Sanity ceilings, not spec limits. A unitless "512000" in an HD column parses as
 * 512 TB, and the row is permanent — so a size that can only be a unit mistake
 * fails here instead of getting written. Both sit far above any Mac that ships.
 */
export const MAX_RAM_BYTES = 4 * 1024 ** 4; // 4 TiB
export const MAX_HD_BYTES = 100 * 1000 ** 4; // 100 TB

/** What the wizard holds mid-flight — everything optional, nothing trusted yet. */
export const draftPayloadSchema = z
  .object({
    serial: z.string().trim().default(''),
    identifier: z.string().trim().default(''),
    name: z.string().trim().default(''),
    model: z.string().trim().default(''),
    year: z.union([z.string(), z.number()]).nullable().default(null),
    cpu: z.string().trim().default(''),
    ramBytes: z.union([z.string(), z.number()]).nullable().default(null),
    hdBytes: z.union([z.string(), z.number()]).nullable().default(null),
    batteryHealth: z.union([z.string(), z.number()]).nullable().default(null),
    batteryCycles: z.union([z.string(), z.number()]).nullable().default(null),
    physicalIssues: z.string().default(''),
    functionalIssues: z.string().default(''),
    firmwareLocked: z.enum(FIRMWARE_LOCKED).nullable().default(null),
    osReset: z.enum(OS_RESET).nullable().default(null),
    activationLock: z.enum(ACTIVATION_LOCK).nullable().default(null),
    mdmEnrolled: z.enum(MDM_ENROLLED).nullable().default(null),
    ingestedBy: z.string().trim().default(''),
  })
  .partial();

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

/** The commit boundary. Anything past here is going into an immutable row. */
export const commitSchema = z.object({
  serial: z.string().trim().min(1, 'Serial is required'),
  identifier: z.string().trim().min(1, 'Identifier is required'),
  name: optionalText,
  model: optionalText,
  year: optionalInt(2006, 2100),
  cpu: optionalText,
  ramBytes: optionalInt(1, MAX_RAM_BYTES, 'must be a whole byte count up to 4 TiB — check the units'),
  hdBytes: optionalInt(0, MAX_HD_BYTES, 'must be a whole byte count up to 100 TB — check the units'),
  batteryHealth: optionalInt(0, 100),
  batteryCycles: optionalInt(0, 100_000),
  physicalIssues: optionalText,
  functionalIssues: optionalText,
  firmwareLocked: z.enum(FIRMWARE_LOCKED),
  osReset: z.enum(OS_RESET),
  activationLock: z.enum(ACTIVATION_LOCK),
  mdmEnrolled: z.enum(MDM_ENROLLED),
  ingestedBy: z.string().trim().min(1, 'Ingested By is required'),
});

export type CommitInput = z.input<typeof commitSchema>;
export type CommitValues = z.output<typeof commitSchema>;

export const correctionSchema = commitSchema.extend({
  supersedesId: z.number().int().positive(),
  correctionNote: z.string().trim().min(1, 'A correction needs a reason'),
});

/** Prose for the commit-time preview. Keyed by what deriveBlockers emits. */
export const BLOCKER_LABELS: Record<string, string> = {
  'activation-lock': 'Activation Lock enabled',
  'mdm-enrolled': 'Enrolled via DEP/MDM',
  'firmware-locked': 'Firmware password not cleared',
  'smart-failing': 'Functional issues mention a failing drive',
};

/** Same slugs, short enough for a table badge. Lives here so only one file knows the slugs. */
export const BLOCKER_BADGES: Record<string, string> = {
  'activation-lock': 'Activation Lock',
  'mdm-enrolled': 'DEP/MDM',
  'firmware-locked': 'Firmware',
  'smart-failing': 'SMART failing',
};

/**
 * Anything here stops resale. Derived at commit time rather than typed, so the
 * reasons on a record always match the values recorded alongside them.
 */
export function deriveBlockers(v: {
  activationLock?: string | null;
  mdmEnrolled?: string | null;
  firmwareLocked?: string | null;
  functionalIssues?: string | null;
}): string[] {
  const blockers: string[] = [];
  if (v.activationLock === 'enabled') blockers.push('activation-lock');
  if (v.mdmEnrolled === 'yes') blockers.push('mdm-enrolled');
  if (v.firmwareLocked === 'yes') blockers.push('firmware-locked');
  if (/\bfailing\b/i.test(v.functionalIssues ?? '')) blockers.push('smart-failing');
  return blockers;
}
