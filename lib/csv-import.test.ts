import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMPORT_ROWS, normalizeCsv, parseBattery, parseBytes } from './csv-import.ts';
import { EXPORT_HEADERS, TEMPLATE_HEADERS, matchHeaders } from './csv-columns.ts';

const HEAD = 'Serial,Identifier,Firmware Locked,OS Reset,Activation Lock,MDM Enrolled';
const row = (extra = '') => `RW2D0HDQRJ,Mac15,6,n/a,yes,disabled,no${extra}`;

// Identifiers contain a comma, so every fixture quotes them the way a real
// export does.
const OK = `${HEAD}\nRW2D0HDQRJ,"Mac15,6",n/a,yes,disabled,no`;

test('parseBytes reads units, raw bytes and unitless values', () => {
  const cases: [string, 1024 | 1000, number | null | 'invalid'][] = [
    ['16 GB', 1024, 17179869184],
    ['16GB', 1024, 17179869184],
    ['16', 1024, 17179869184],
    ['17179869184', 1024, 17179869184],
    ['16 GiB', 1000, 17179869184],
    ['512 GB', 1000, 512000000000],
    ['512', 1000, 512000000000],
    ['1 TB', 1000, 1000000000000],
    ['1,024', 1000, 1024000000000],
    ['None', 1000, 0],
    ['none', 1000, 0],
    ['0', 1000, 0],
    ['', 1000, null],
    ['—', 1000, null],
    ['potato', 1000, 'invalid'],
    ['16 QB', 1000, 'invalid'],
  ];
  for (const [input, base, expected] of cases) {
    assert.equal(parseBytes(input, base), expected, `${input} @${base}`);
  }
});

test('export headers round-trip through header matching', () => {
  const match = matchHeaders([...EXPORT_HEADERS]);
  assert.deepEqual(match.missing, []);
  assert.deepEqual(match.unknown, []);
  assert.deepEqual(match.duplicated, []);
  // Provenance and audit columns are recognised and deliberately dropped.
  assert.ok(match.ignored.includes('Ingested By'));
  assert.ok(match.ignored.includes('Processed At'));
  assert.ok(match.ignored.includes('Record #'));
});

test('the blank template covers every required column', () => {
  assert.deepEqual(matchHeaders(TEMPLATE_HEADERS).missing, []);
  assert.equal(TEMPLATE_HEADERS.length, 16);
});

test('header aliases are case and punctuation insensitive', () => {
  const match = matchHeaders(['serial_number', 'HW MODEL', 'firmware', 'os-reset', 'Activation', 'DEP/MDM']);
  assert.deepEqual(match.missing, []);
  assert.deepEqual([...match.map.values()], [
    'serial', 'identifier', 'firmwareLocked', 'osReset', 'activationLock', 'mdmEnrolled',
  ]);
});

test('a missing required column rejects the whole file', () => {
  const result = normalizeCsv('Serial,Identifier\nX,Y');
  assert.match(result.fatal ?? '', /Missing required columns: Firmware Locked, OS Reset/);
  assert.deepEqual(result.rows, []);
});

test('two columns mapping to one field reject the whole file', () => {
  const result = normalizeCsv(`${HEAD},serial_number\n${row(',dup')}`);
  assert.match(result.fatal ?? '', /Serial/);
});

test('unknown columns are warned about, not fatal', () => {
  const result = normalizeCsv(`${HEAD},Shelf\nRW2D0HDQRJ,"Mac15,6",n/a,yes,disabled,no,B4`);
  assert.equal(result.fatal, null);
  assert.deepEqual(result.unknownHeaders, ['Shelf']);
  assert.deepEqual(result.rows[0].issues, []);
});

test('a valid row produces commit input and no issues', () => {
  const result = normalizeCsv(OK);
  assert.equal(result.fatal, null);
  assert.equal(result.rows.length, 1);
  const [r] = result.rows;
  assert.deepEqual(r.issues, []);
  assert.equal(r.line, 2);
  assert.equal(r.serial, 'RW2D0HDQRJ');
  assert.equal(r.input?.identifier, 'Mac15,6');
});

test('enum synonyms and casing are accepted', () => {
  const result = normalizeCsv(`${HEAD}\nS1,"Mac15,6",CLEARED,Y,On,Enrolled`);
  assert.deepEqual(result.rows[0].issues, []);
  assert.deepEqual(
    {
      firmwareLocked: result.rows[0].input?.firmwareLocked,
      osReset: result.rows[0].input?.osReset,
      activationLock: result.rows[0].input?.activationLock,
      mdmEnrolled: result.rows[0].input?.mdmEnrolled,
    },
    { firmwareLocked: 'cleared', osReset: 'yes', activationLock: 'enabled', mdmEnrolled: 'yes' },
  );
});

test('n/a is a real Firmware Locked value, not a blank', () => {
  const result = normalizeCsv(`${HEAD}\nS1,"Mac15,6",N/A,yes,unsupported,unknown`);
  assert.deepEqual(result.rows[0].issues, []);
  assert.equal(result.rows[0].input?.firmwareLocked, 'n/a');
});

test('a blank required enum is an error, never a default', () => {
  const result = normalizeCsv(`${HEAD}\nS1,"Mac15,6",n/a,yes,,no`);
  assert.deepEqual(result.rows[0].issues, [
    { field: 'Activation Lock', message: 'required — one of enabled, disabled, unsupported, unknown' },
  ]);
  assert.equal(result.rows[0].input, null);
});

test('em-dashes round-trip back to null instead of failing', () => {
  const text = `${HEAD},Year,RAM,HD,Battery Health,Name\nS1,"Mac15,6",n/a,yes,disabled,no,—,—,—,—,—`;
  const [r] = normalizeCsv(text).rows;
  assert.deepEqual(r.issues, []);
  assert.equal(r.ramBytes, null);
  assert.equal(r.hdBytes, null);
  assert.equal(r.input?.year, undefined);
});

test('messy real-world values are normalised', () => {
  const text =
    `${HEAD},Year,RAM,HD,Battery Health,Battery Cycles\n` +
    `S1,"Mac15,6",no,yes,disabled,no,Late 2013,16GB,1 TB,94%,"1,024"`;
  const [r] = normalizeCsv(text).rows;
  assert.deepEqual(r.issues, []);
  assert.equal(r.input?.year, '2013');
  assert.equal(r.ramBytes, 17179869184);
  assert.equal(r.hdBytes, 1000000000000);
  assert.equal(r.input?.batteryHealth, '94');
  assert.equal(r.input?.batteryCycles, '1024');
});

test('HD of none is zero bytes, RAM of none is rejected', () => {
  const text = `${HEAD},RAM,HD\nS1,"Mac15,6",no,yes,disabled,no,None,None`;
  const [r] = normalizeCsv(text).rows;
  assert.equal(r.hdBytes, 0);
  // ram_bytes has a > 0 CHECK, and commitSchema mirrors it — so this must fail
  // here rather than at INSERT time.
  assert.ok(r.issues.some((i) => i.field === 'RAM'));
});

test('range and format errors come from commitSchema, with its wording', () => {
  const text =
    `${HEAD},Year,Battery Health,RAM\n` +
    `S1,"Mac15,6",no,yes,disabled,no,1998,105,potato`;
  const [r] = normalizeCsv(text).rows;
  const fields = r.issues.map((i) => i.field);
  assert.ok(fields.includes('Year'));
  assert.ok(fields.includes('Battery Health'));
  assert.ok(fields.includes('RAM'));
  assert.equal(r.input, null);
});

test('a ragged row is flagged and never silently padded', () => {
  const result = normalizeCsv(`${HEAD}\nS1,"Mac15,6",no,yes`);
  const [r] = result.rows;
  assert.ok(r.issues.some((i) => i.field === 'row' && /has 4 fields, expected 6/.test(i.message)));
  assert.equal(r.input, null);
});

test('bad rows do not sink the good ones', () => {
  const text = `${HEAD}\n${'S1,"Mac15,6",no,yes,disabled,no'}\nS2,"Mac15,6",no,yes,,no`;
  const result = normalizeCsv(text);
  assert.equal(result.rows.filter((r) => r.input).length, 1);
  assert.equal(result.rows.filter((r) => r.issues.length).length, 1);
  assert.deepEqual(result.rows.map((r) => r.line), [2, 3]);
});

test('formula guards are stripped on the way in', () => {
  const text = `${HEAD},Physical Issues\nS1,"Mac15,6",no,yes,disabled,no,"'-no charger"`;
  const [r] = normalizeCsv(text).rows;
  assert.equal(r.input?.physicalIssues, '-no charger');
});

test('the row cap rejects the file before any preview', () => {
  const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'S,"Mac15,6",no,yes,disabled,no');
  const result = normalizeCsv(`${HEAD}\n${body.join('\n')}`);
  assert.match(result.fatal ?? '', /capped at 2,000/);
  assert.deepEqual(result.rows, []);
});

test('an unparseable file fails whole rather than per row', () => {
  const result = normalizeCsv(`${HEAD}\nS1,"Mac15,6,no,yes,disabled,no`);
  assert.match(result.fatal ?? '', /Unterminated quoted field/);
});

test('a missing serial reads as required, not as a raw type error', () => {
  const result = normalizeCsv(`${HEAD}\n,"Mac15,6",n/a,yes,disabled,no`);
  assert.deepEqual(result.rows[0].issues, [{ field: 'Serial', message: 'Serial is required' }]);
});

test('parseBattery splits a combined health/cycles cell', () => {
  const cases: [string, { health?: string; cycles?: string } | 'invalid'][] = [
    ['94% / 247 cycles', { health: '94', cycles: '247' }],
    ['94% · 247c', { health: '94', cycles: '247' }],
    ['94/247', { health: '94', cycles: '247' }],
    ['94, 247', { health: '94', cycles: '247' }],
    ['94% (247 cycles)', { health: '94', cycles: '247' }],
    ['94% / 1,024 cycles', { health: '94', cycles: '1024' }],
    ['94.0%', { health: '94' }],
    ['94%', { health: '94' }],
    ['94', { health: '94' }],
    ['', {}],
    ['n/a cycles', 'invalid'],
    ['94 / 247 / 12', 'invalid'],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseBattery(input), expected, input);
  }
});

test('a combined Battery column fills both fields end to end', () => {
  const [r] = normalizeCsv(`${HEAD},Battery\nS1,"Mac15,6",n/a,yes,disabled,no,"94% / 247 cycles"`).rows;
  assert.deepEqual(r.issues, []);
  assert.equal(r.input?.batteryHealth, '94');
  assert.equal(r.input?.batteryCycles, '247');
});

test('an explicit Battery Cycles column beats one bundled into Battery', () => {
  const text = `${HEAD},Battery,Battery Cycles\nS1,"Mac15,6",n/a,yes,disabled,no,"94% / 247 cycles",301`;
  const [r] = normalizeCsv(text).rows;
  assert.deepEqual(r.issues, []);
  assert.equal(r.input?.batteryCycles, '301');
});

test('an unreadable Battery cell fails loudly', () => {
  const [r] = normalizeCsv(`${HEAD},Battery\nS1,"Mac15,6",n/a,yes,disabled,no,potato`).rows;
  assert.ok(r.issues.some((i) => i.field === 'Battery Health' && /couldn't read/.test(i.message)));
  assert.equal(r.input, null);
});

test('every sheet-column badge in the wizard is a column the importer understands', async () => {
  // The badges drifted once already: Activation Lock and MDM Enrolled were
  // marked as having no column long after commitSchema started requiring them.
  const { STEPS } = await import('./intake-steps.ts');
  const badges = [...new Set(STEPS.flatMap((s) => s.fields.map((f) => f.column)))].filter(
    (c) => c !== '—',
  );
  for (const badge of badges) {
    const { map, unknown } = matchHeaders([badge]);
    assert.deepEqual(unknown, [], `wizard badge "${badge}" is not an importable column`);
    assert.equal(map.size, 1, `wizard badge "${badge}" maps to no field`);
  }
});

test('every required field is collected by the wizard and importable', async () => {
  const { STEPS, REQUIRED_KEYS } = await import('./intake-steps.ts');
  const collected = new Set(STEPS.flatMap((s) => s.fields.map((f) => f.key)));
  for (const key of REQUIRED_KEYS) {
    assert.ok(collected.has(key), `${key} is required but the wizard never asks for it`);
  }
});
