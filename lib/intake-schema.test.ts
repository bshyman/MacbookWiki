import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitSchema, deriveBlockers } from './intake-schema.ts';

const MINIMAL = { serial: 'abc123', ingestedBy: 'test' };

test('serial and operator are the only required fields', () => {
  const parsed = commitSchema.parse(MINIMAL);
  assert.equal(parsed.serial, 'ABC123');
  assert.equal(parsed.identifier, null);
  assert.equal(parsed.firmwareLocked, null);
  assert.equal(parsed.osReset, null);
  assert.equal(parsed.activationLock, null);
  assert.equal(parsed.mdmEnrolled, null);
});

test('serials are trimmed and uppercased at the commit boundary', () => {
  assert.equal(commitSchema.parse({ ...MINIMAL, serial: '  c02fm5rhq6l7 ' }).serial, 'C02FM5RHQ6L7');
});

test('a blank serial still refuses to commit', () => {
  assert.equal(commitSchema.safeParse({ ...MINIMAL, serial: '   ' }).success, false);
});

test("an empty-string select reads as absent, not as an invalid enum", () => {
  const parsed = commitSchema.parse({ ...MINIMAL, activationLock: '', firmwareLocked: ' ' });
  assert.equal(parsed.activationLock, null);
  assert.equal(parsed.firmwareLocked, null);
});

test('a provided lock value must be one of the allowed ones', () => {
  assert.equal(commitSchema.safeParse({ ...MINIMAL, mdmEnrolled: 'maybe' }).success, false);
});

test('missing or unknown lock readings derive the locks-unverified blocker', () => {
  assert.ok(deriveBlockers(commitSchema.parse(MINIMAL)).includes('locks-unverified'));
  assert.ok(
    deriveBlockers({ activationLock: 'unknown', mdmEnrolled: 'no', firmwareLocked: 'no' }).includes(
      'locks-unverified',
    ),
  );
  // '' is how a draft payload spells absent — the review preview runs on drafts.
  assert.ok(
    deriveBlockers({ activationLock: '', mdmEnrolled: 'no', firmwareLocked: 'no' }).includes(
      'locks-unverified',
    ),
  );
});

test('fully verified locks derive no unverified blocker', () => {
  const blockers = deriveBlockers({
    activationLock: 'disabled',
    mdmEnrolled: 'no',
    firmwareLocked: 'n/a',
  });
  assert.ok(!blockers.includes('locks-unverified'));
});

test('unsupported activation lock counts as verified — pre-T2 Macs cannot have it', () => {
  const blockers = deriveBlockers({
    activationLock: 'unsupported',
    mdmEnrolled: 'no',
    firmwareLocked: 'cleared',
  });
  assert.ok(!blockers.includes('locks-unverified'));
});

test('a hard lock still blocks even when others are unverified', () => {
  const blockers = deriveBlockers({ activationLock: 'enabled', mdmEnrolled: null, firmwareLocked: null });
  assert.ok(blockers.includes('activation-lock'));
  assert.ok(blockers.includes('locks-unverified'));
});
