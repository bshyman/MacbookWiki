import type { DraftPayload } from './intake-schema';

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'identifier';

export interface Field {
  key: keyof DraftPayload;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Sheet column this fills, shown as a badge. */
  column: string;
}

export interface WizardStep {
  slug: string;
  title: string;
  /** One line: what you're doing on this screen. */
  summary: string;
  /** The matching doc page — every step links out to the full procedure. */
  doc: string;
  commands?: { code: string; note: string }[];
  fields: Field[];
}

const RAM_OPTIONS = [4, 8, 16, 18, 24, 32, 36, 48, 64, 96, 128].map((gb) => ({
  value: String(gb * 1024 ** 3),
  label: `${gb} GB`,
}));

const STORAGE_OPTIONS = [
  { value: '0', label: 'None — no disk detected' },
  ...[128, 256, 512].map((gb) => ({ value: String(gb * 1000 ** 3), label: `${gb} GB` })),
  ...[1, 2, 4, 8].map((tb) => ({ value: String(tb * 1000 ** 4), label: `${tb} TB` })),
];

export const STEPS: WizardStep[] = [
  {
    slug: 'physical-inspection',
    title: 'Physical Inspection',
    summary: 'Before powering on — cosmetic condition, then the power-on checks.',
    doc: '/docs/steps/physical-inspection',
    fields: [
      {
        key: 'physicalIssues',
        label: 'Physical issues',
        kind: 'textarea',
        column: 'Physical Issues',
        placeholder: 'Dents, screen damage, keyboard wear, missing screws, liquid damage, missing charger…',
        hint: 'Leave blank only if genuinely clean — blank reads as "inspected, nothing found".',
      },
      {
        key: 'functionalIssues',
        label: 'Functional issues',
        kind: 'textarea',
        column: 'Functional Issues',
        placeholder: 'Backlight, trackpad click, fan, dead pixels, Apple Diagnostics reference codes…',
        hint: 'Apple Diagnostics needs no OS or password — Intel: hold D. Apple Silicon: hold power → ⌘D.',
      },
    ],
  },
  {
    slug: 'device-state',
    title: 'Power On and Read the Screen',
    summary: 'Whatever it shows first decides your path. Note anything the screen tells you.',
    doc: '/docs/steps/device-state',
    fields: [],
  },
  {
    slug: 'firmware-password',
    title: 'Firmware Password',
    summary: 'Only if you hit a padlock prompt. Intel only — Apple Silicon has none.',
    doc: '/docs/steps/firmware-password',
    commands: [
      { code: 'firmwarepasswd -check', note: 'Confirm whether one is set' },
      { code: 'firmwarepasswd -delete', note: 'Clear it (prompts for the current password)' },
    ],
    fields: [
      {
        key: 'firmwareLocked',
        label: 'Firmware locked',
        kind: 'select',
        column: 'Firmware Locked',
        options: [
          { value: 'no', label: 'No — never saw a padlock' },
          { value: 'cleared', label: 'Cleared — removed with firmwarepasswd' },
          { value: 'yes', label: 'Yes — still locked, password unavailable' },
          { value: 'n/a', label: 'N/A — Apple Silicon' },
        ],
        hint: 'Yes is a blocker: it needs Apple’s reset key or an Apple Configurator erase.',
      },
    ],
  },
  {
    slug: 'enter-recovery',
    title: 'Enter Recovery',
    summary: 'Intel: hold ⌘R immediately. Apple Silicon: hold power until "Loading startup options".',
    doc: '/docs/steps/enter-recovery',
    fields: [],
  },
  {
    slug: 'disk-and-volume',
    title: 'Select the Disk and Volume',
    summary: 'What the picker offers tells you the state of the drive. You can skip the user-password prompt.',
    doc: '/docs/steps/disk-and-volume',
    fields: [],
  },
  {
    slug: 'intake-commands',
    title: 'Run the Intake Commands',
    summary: 'Recovery → Utilities menu → Terminal. Start with the Identifier — it fills three more columns.',
    doc: '/docs/steps/intake-commands',
    commands: [
      { code: 'sysctl -n hw.model', note: '→ Identifier' },
      { code: `ioreg -l | grep -i '"product-name"'`, note: '→ Name (needed on Apple Silicon)' },
      { code: 'ioreg -l | grep -i IOPlatformSerialNumber', note: '→ Serial' },
      { code: 'sysctl -n machdep.cpu.brand_string', note: '→ CPU' },
      { code: 'sysctl -n hw.memsize', note: '→ RAM (raw bytes)' },
      { code: 'diskutil info disk0 | grep "Disk Size"', note: '→ HD (round up)' },
    ],
    fields: [
      {
        key: 'identifier',
        label: 'Identifier',
        kind: 'identifier',
        column: 'Identifier',
        placeholder: 'Mac15,6',
        hint: 'Exactly as surfaced — no spaces around the comma. Fills Name, Model, Year and CPU below.',
      },
      { key: 'serial', label: 'Serial', kind: 'text', column: 'Serial', placeholder: 'RW2D0HDQRJ' },
      { key: 'name', label: 'Name', kind: 'text', column: 'Name', placeholder: 'MacBook Pro' },
      { key: 'model', label: 'Model (A-number)', kind: 'text', column: 'Model', placeholder: 'A2992' },
      { key: 'year', label: 'Year', kind: 'number', column: 'Year', placeholder: '2023' },
      { key: 'cpu', label: 'CPU', kind: 'text', column: 'CPU', placeholder: 'Apple M3 Pro' },
      { key: 'ramBytes', label: 'RAM', kind: 'select', column: 'RAM', options: RAM_OPTIONS },
      {
        key: 'hdBytes',
        label: 'HD',
        kind: 'select',
        column: 'HD',
        options: STORAGE_OPTIONS,
        hint: 'Disk Size reads a few percent under the marketed size — round up.',
      },
    ],
  },
  {
    slug: 'battery-health',
    title: 'Battery Health',
    summary: 'system_profiler when booted; ioreg in Recovery. Apple Silicon needs AppleRawMaxCapacity.',
    doc: '/docs/steps/battery-health',
    commands: [
      { code: 'system_profiler SPPowerDataType', note: 'Booted — reports a percentage directly' },
      {
        code: 'ioreg -rc AppleSmartBattery | egrep "DesignCapacity|MaxCapacity|CycleCount"',
        note: 'Recovery — read the values and apply the formula',
      },
    ],
    fields: [
      {
        key: 'batteryHealth',
        label: 'Battery health %',
        kind: 'number',
        column: 'Battery',
        placeholder: '94',
        hint: 'On Apple Silicon compute AppleRawMaxCapacity / DesignCapacity × 100 — MaxCapacity is pinned near 100.',
      },
      { key: 'batteryCycles', label: 'Cycle count', kind: 'number', column: 'Battery', placeholder: '247' },
    ],
  },
  {
    slug: 'activation-lock-mdm',
    title: 'Activation Lock and MDM',
    summary: 'Booted checks only — neither works in Recovery. Either one positive stops intake.',
    doc: '/docs/steps/activation-lock-mdm',
    commands: [
      { code: 'system_profiler SPHardwareDataType | grep -i activation', note: '→ Activation Lock' },
      { code: 'profiles status -type enrollment', note: '→ MDM / DEP enrollment' },
    ],
    fields: [
      {
        key: 'activationLock',
        label: 'Activation Lock',
        kind: 'select',
        column: 'Activation Lock',
        options: [
          { value: 'disabled', label: 'Disabled' },
          { value: 'enabled', label: 'Enabled — blocker' },
          { value: 'unsupported', label: 'Unsupported — pre-T2 Intel' },
          { value: 'unknown', label: 'Unknown — could not boot' },
        ],
        hint: 'An empty result on pre-T2 Intel means unsupported, not Disabled.',
      },
      {
        key: 'mdmEnrolled',
        label: 'MDM / DEP enrolled',
        kind: 'select',
        column: 'MDM Enrolled',
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes — blocker' },
          { value: 'unknown', label: 'Unknown — could not boot' },
        ],
      },
    ],
  },
  {
    slug: 'disk-utility',
    title: 'Disk Utility',
    summary: 'Turn on View → Show All Devices first. Erase only after the lock checks come back clean.',
    doc: '/docs/steps/disk-utility',
    fields: [
      {
        key: 'osReset',
        label: 'OS reset',
        kind: 'select',
        column: 'OS Reset',
        options: [
          { value: 'no', label: 'No — not erased' },
          { value: 'yes', label: 'Yes — erased and macOS reinstalled' },
        ],
        hint: 'On T2 and Apple Silicon, erase the Macintosh HD volume group — not the physical disk.',
      },
    ],
  },
  {
    slug: 'finish',
    title: 'Finish the Sheet',
    summary: 'Review every column, then commit. Committed records cannot be edited.',
    doc: '/docs/steps/finish',
    // Ingested By used to live here as a text box. It's stamped from the signed-in
    // operator now — a name typed per record is a name anyone can put on a row
    // they can't delete afterwards.
    fields: [],
  },
];

/**
 * Upper bound on the persisted step number. Must stay <= the CHECK on
 * intake_drafts.step in db/001_intake.sql — adding steps past this needs a
 * migration first, or every draft save fails the constraint.
 */
export const MAX_STEP = 10;

export const REQUIRED_KEYS: (keyof DraftPayload)[] = [
  'serial',
  'identifier',
  'firmwareLocked',
  'osReset',
  'activationLock',
  'mdmEnrolled',
];

export function missingRequired(payload: DraftPayload): (keyof DraftPayload)[] {
  return REQUIRED_KEYS.filter((k) => {
    const v = payload[k];
    return v === null || v === undefined || String(v).trim() === '';
  });
}

const FIELD_BY_KEY = new Map(STEPS.flatMap((s) => s.fields.map((f) => [f.key, f] as const)));

/**
 * The option label behind a stored value — 'n/a' reads as 'N/A — Apple Silicon'.
 * Null when the field has no options or the value isn't one of them, so callers
 * can fall back to their own formatting.
 */
export function labelFor(key: keyof DraftPayload, value: unknown): string | null {
  const options = FIELD_BY_KEY.get(key)?.options;
  return options?.find((o) => o.value === String(value))?.label ?? null;
}
