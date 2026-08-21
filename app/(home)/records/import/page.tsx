import Link from 'next/link';
import type { Metadata } from 'next';
import { CsvImport } from '@/components/csv-import';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Import records' };

export default async function ImportPage() {
  await requireSession();

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import records</h1>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            Every row is checked before anything is written, and the whole file commits or none of
            it does. Committed rows can never be deleted — only corrected.
          </p>
        </div>
        <Link href="/records" className="rounded-lg border border-fd-border px-4 py-2 text-sm">
          Back to records
        </Link>
      </div>

      <CsvImport />
    </main>
  );
}
