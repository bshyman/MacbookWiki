import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_EXPORT_IDS, parseExportIds } from './export-ids.ts';

test('parses a comma list into descending ids', () => {
  assert.deepEqual(parseExportIds('3,1,2'), [3, 2, 1]);
});

test('tolerates whitespace around ids', () => {
  assert.deepEqual(parseExportIds(' 7 , 9 '), [9, 7]);
});

test('dedupes', () => {
  assert.deepEqual(parseExportIds('5,5,5'), [5]);
});

test('drops anything that is not a positive integer', () => {
  assert.deepEqual(parseExportIds('1,0,-2,1.5,abc,,NaN,Infinity,2'), [2, 1]);
});

test('drops ids past the safe-integer range', () => {
  assert.deepEqual(parseExportIds('9007199254740993,4'), [4]);
});

test('non-string input yields nothing', () => {
  assert.deepEqual(parseExportIds(null), []);
  assert.deepEqual(parseExportIds(undefined), []);
  assert.deepEqual(parseExportIds(42), []);
});

test('empty input yields nothing', () => {
  assert.deepEqual(parseExportIds(''), []);
  assert.deepEqual(parseExportIds(',,,'), []);
});

test('caps at MAX_EXPORT_IDS, keeping the highest ids', () => {
  const raw = Array.from({ length: MAX_EXPORT_IDS + 500 }, (_, i) => i + 1).join(',');
  const ids = parseExportIds(raw);
  assert.equal(ids.length, MAX_EXPORT_IDS);
  assert.equal(ids[0], MAX_EXPORT_IDS + 500);
  assert.equal(ids[ids.length - 1], 501);
});
