import Link from 'next/link';
import type { Metadata } from 'next';
import { ModelTable } from '@/components/model-table';

export const metadata: Metadata = {
  title: 'Model Lookup',
  description:
    'Every Apple notebook since the Intel transition. Filter by Model Identifier, A-number, year, or spec.',
};

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">MacBook Model Lookup</h1>
        <p className="mt-1 text-sm text-fd-muted-foreground">
          Every Apple notebook since the Intel transition, 2006&#8202;–&#8202;present.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-fd-border bg-fd-card p-4 text-sm leading-relaxed">
        <strong>How to find your machine:</strong> run{' '}
        <code className="rounded bg-fd-secondary px-1.5 py-0.5 text-[0.85em]">
          sysctl -n hw.model
        </code>{' '}
        in Terminal and pick the result from the <strong>Identifier</strong> filter below — that one
        value derives the Name, Model, and Year columns of the intake sheet. The A-number is engraved
        on the bottom of the chassis. Running intake on an unknown machine? Start at the{' '}
        <Link href="/docs" className="text-fd-primary underline underline-offset-2">
          intake workflow
        </Link>
        , or jump to the{' '}
        <Link
          href="/docs/reference/column-index"
          className="text-fd-primary underline underline-offset-2"
        >
          command reference
        </Link>
        .
      </div>

      <ModelTable />

      <div className="mt-8 space-y-3 text-xs leading-relaxed text-fd-muted-foreground">
        <p>
          <strong className="text-fd-foreground">Notes on battery health.</strong> Apple&apos;s rated
          maximum cycle count is the number of full discharge cycles the battery should sustain while
          retaining ~80% of original capacity. Pre-Mid-2009 MacBook Pros and the original MacBook Air
          used 300-cycle batteries; almost every notebook since Mid-2009 uses a 1000-cycle pack. To
          read the current count, see{' '}
          <Link
            href="/docs/steps/battery-health"
            className="text-fd-primary underline underline-offset-2"
          >
            Battery Health
          </Link>
          .
        </p>
        <p>
          <strong className="text-fd-foreground">Sources.</strong> Model identifiers, A-numbers, and
          core specs were compiled from{' '}
          <a
            href="https://everymac.com"
            target="_blank"
            rel="noreferrer"
            className="text-fd-primary underline underline-offset-2"
          >
            EveryMac.com
          </a>{' '}
          and verified against Apple&apos;s identification pages:{' '}
          <a
            href="https://support.apple.com/en-us/108052"
            target="_blank"
            rel="noreferrer"
            className="text-fd-primary underline underline-offset-2"
          >
            MacBook Pro
          </a>
          ,{' '}
          <a
            href="https://support.apple.com/en-us/102869"
            target="_blank"
            rel="noreferrer"
            className="text-fd-primary underline underline-offset-2"
          >
            MacBook Air
          </a>
          , and{' '}
          <a
            href="https://support.apple.com/en-us/102767"
            target="_blank"
            rel="noreferrer"
            className="text-fd-primary underline underline-offset-2"
          >
            Find your Mac model
          </a>
          . Battery cycle ratings come from Apple&apos;s{' '}
          <a
            href="https://support.apple.com/en-us/101575"
            target="_blank"
            rel="noreferrer"
            className="text-fd-primary underline underline-offset-2"
          >
            battery service guide
          </a>
          .
        </p>
      </div>
    </main>
  );
}
