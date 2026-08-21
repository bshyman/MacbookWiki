import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardFormula, parseCsv, serializeCsv, unguardFormula } from './csv.ts';

test('splits plain records', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('quoted fields keep commas, newlines and escaped quotes', () => {
  const cases: [string, string[][]][] = [
    ['a,"b,c"', [['a', 'b,c']]],
    ['a,"line1\nline2"', [['a', 'line1\nline2']]],
    ['a,"line1\r\nline2"', [['a', 'line1\r\nline2']]],
    ['a,"say ""hi"""', [['a', 'say "hi"']]],
    ['"",""', [['', '']]],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseCsv(input), expected, input);
  }
});

test('strips a leading BOM', () => {
  assert.deepEqual(parseCsv('﻿Serial,Name\nX,Y'), [
    ['Serial', 'Name'],
    ['X', 'Y'],
  ]);
});

test('handles CRLF, LF and bare CR terminators', () => {
  const expected = [
    ['a', 'b'],
    ['c', 'd'],
  ];
  assert.deepEqual(parseCsv('a,b\r\nc,d'), expected);
  assert.deepEqual(parseCsv('a,b\nc,d'), expected);
  assert.deepEqual(parseCsv('a,b\rc,d'), expected);
});

test('drops a trailing newline but keeps a trailing empty field', () => {
  assert.deepEqual(parseCsv('a,b\r\n'), [['a', 'b']]);
  assert.deepEqual(parseCsv('a,b\n\n'), [['a', 'b']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(''), []);
});

test('a blank line mid-file stays a row', () => {
  // Only the trailing one is terminator noise. A gap in the middle is a real
  // record, and the importer flags it as ragged rather than skipping it.
  assert.deepEqual(parseCsv('a,b\n\nc,d\n'), [['a', 'b'], [''], ['c', 'd']]);
});

test('ragged rows are preserved, never padded', () => {
  // Padding would shift columns silently, which on an append-only ledger writes
  // one machine's serial onto another machine's readings.
  assert.deepEqual(parseCsv('a,b,c\n1,2\n3,4,5,6'), [
    ['a', 'b', 'c'],
    ['1', '2'],
    ['3', '4', '5', '6'],
  ]);
});

test('unterminated quote fails the whole file with a line number', () => {
  assert.throws(() => parseCsv('a,b\nc,"oops\nd,e'), /line 2/);
});

test('serializes with CRLF and quotes only when needed', () => {
  assert.equal(serializeCsv([['a', 'b']]), 'a,b\r\n');
  assert.equal(serializeCsv([['a,b', 'c"d', 'e\nf', ' g ']]), '"a,b","c""d","e\nf"," g "\r\n');
  assert.equal(serializeCsv([]), '');
});

test('round-trips a corpus through serialize and parse', () => {
  const rows = [
    ['Serial', 'Physical Issues', 'HD'],
    ['RW2D0HDQRJ', 'dented lid, "scuffed" base', '512 GB'],
    ['C02XK1TWJG5H', 'multi\nline note', 'None'],
    ['', '  padded  ', '—'],
  ];
  assert.deepEqual(parseCsv(serializeCsv(rows)), rows);
});

test('formula guard and unguard are exact inverses', () => {
  const dangerous = ['=1+1', '+cmd', '-no charger, -missing screws', '@SUM(A1)', '\ttab', '\rcr'];
  for (const v of dangerous) {
    assert.equal(guardFormula(v), `'${v}`, v);
    assert.equal(unguardFormula(guardFormula(v)), v, v);
  }
});

test('formula guard leaves ordinary text alone', () => {
  for (const v of ['plain', "it's fine", '', "'quoted", '512 GB']) {
    assert.equal(guardFormula(v), v, v);
    assert.equal(unguardFormula(guardFormula(v)), v, v);
  }
});
