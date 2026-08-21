import { TEMPLATE_HEADERS } from '@/lib/csv-columns';
import { serializeCsv } from '@/lib/csv';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Headers only, and only the ones the importer actually reads — no Record #,
 * Processed At or Ingested By, since those are stamped server-side and filling
 * them in would just be wasted typing.
 */
export async function GET() {
  await requireSession();
  return new Response('﻿' + serializeCsv([[...TEMPLATE_HEADERS]]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="intake-import-template.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
