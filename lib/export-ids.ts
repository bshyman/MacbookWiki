/**
 * Ceiling on one selection export. Bounds the id array Postgres receives and the
 * work a single request can queue up. Well past the 1000 rows the page loads.
 */
export const MAX_EXPORT_IDS = 10_000;

/**
 * Untrusted form field -> ids we're willing to query. Deduped and sorted
 * descending so a selection export lands in the same order as the full-ledger
 * walk. Junk is dropped rather than rejected — the route 400s only when nothing
 * usable survives, so one mangled id can't kill an otherwise fine export.
 */
export function parseExportIds(raw: unknown): number[] {
  if (typeof raw !== 'string') return [];
  const ids = new Set<number>();
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER) ids.add(n);
  }
  return [...ids].sort((a, b) => b - a).slice(0, MAX_EXPORT_IDS);
}
