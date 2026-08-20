// RFC 4180 in ~100 lines. Hand-rolled because the alternatives cost more than
// they save: papaparse is browser-first and would land in the client bundle,
// csv-parse drags Node streams in for what is a string -> string[][] call.

const BOM = '﻿';

/**
 * Ragged rows come back ragged — padding or truncating here would silently shift
 * columns, which on an append-only ledger writes the wrong serial forever. The
 * caller reports the length mismatch as a row error instead.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let quoteStartLine = 1;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }

    if (c === '"' && field === '') {
      inQuotes = true;
      quoteStartLine = line;
    } else if (c === ',') {
      endField();
    } else if (c === '\r') {
      // Bare CR and CRLF both terminate a record.
      if (src[i + 1] === '\n') i++;
      endRow();
      line++;
    } else if (c === '\n') {
      endRow();
      line++;
    } else {
      field += c;
    }
  }

  if (inQuotes) {
    throw new Error(`Unterminated quoted field starting on line ${quoteStartLine}`);
  }

  // A trailing newline leaves one empty record behind. Drop that, but keep a
  // final record that has any content — a lone trailing comma is real data.
  if (field !== '' || row.length > 0) endRow();
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }

  return rows;
}

/** CRLF-terminated, including after the last record. Caller prepends the BOM. */
export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(quote).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}

function quote(value: string): string {
  const needs =
    value.includes('"') ||
    value.includes(',') ||
    value.includes('\r') ||
    value.includes('\n') ||
    value !== value.trim();
  return needs ? `"${value.replaceAll('"', '""')}"` : value;
}

// Excel and Numbers evaluate a cell starting with any of these as a formula.
const FORMULA_LEAD = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * guardFormula and unguardFormula are exact inverses — change one and you must
 * change the other, or round-tripping silently corrupts. Real data hits this:
 * physical issues like "-no charger, -missing screws" lead with a dash.
 */
export function guardFormula(value: string): string {
  return FORMULA_LEAD.has(value[0]) ? `'${value}` : value;
}

export function unguardFormula(value: string): string {
  return value[0] === "'" && FORMULA_LEAD.has(value[1]) ? value.slice(1) : value;
}
