import { EXPORT_HEADERS, recordToCsvRow } from '@/lib/csv-columns';
import { serializeCsv } from '@/lib/csv';
import { parseExportIds } from '@/lib/export-ids';
import { maxRecordId, recordsByIds, recordsPage, type IntakeRecord } from '@/lib/intake';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Rows per round-trip. Small enough that the pool (max 5) is never pinned. */
const PAGE = 500;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Streams CSV from a page puller. One page per pull, so a slow client applies
 * backpressure instead of making us buffer the whole ledger in memory. The
 * puller returns null when there's nothing left.
 */
function csvStream(filename: string, nextPage: () => Promise<IntakeRecord[] | null>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // BOM first, or Excel opens a UTF-8 CSV as mojibake.
      controller.enqueue(encoder.encode('﻿' + serializeCsv([[...EXPORT_HEADERS]])));
    },
    async pull(controller) {
      const rows = await nextPage();
      if (rows === null) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(serializeCsv(rows.map(recordToCsvRow))));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Whole ledger. */
export async function GET() {
  // proxy.ts already gates /records/*, but middleware alone isn't trusted here —
  // same reasoning as every page (see lib/session.ts).
  await requireSession();

  const max = await maxRecordId();
  let cursor = max === null ? 0 : max + 1;

  return csvStream(`intake-records-${stamp()}Z.csv`, async () => {
    if (cursor <= 0) return null;
    const rows = await recordsPage(cursor, PAGE);
    if (rows.length === 0) return null;
    cursor = rows.length < PAGE ? 0 : rows[rows.length - 1].id;
    return rows;
  });
}

/**
 * The rows an operator ticked in the table. POST rather than a query string
 * because a few thousand ids blow straight past URL length limits.
 */
export async function POST(req: Request) {
  await requireSession();

  const form = await req.formData();
  const ids = parseExportIds(form.get('ids'));
  if (ids.length === 0) {
    return new Response('No records selected.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let offset = 0;
  return csvStream(`intake-records-selection-${stamp()}Z.csv`, async () => {
    if (offset >= ids.length) return null;
    const chunk = ids.slice(offset, offset + PAGE);
    offset += PAGE;
    return recordsByIds(chunk);
  });
}
