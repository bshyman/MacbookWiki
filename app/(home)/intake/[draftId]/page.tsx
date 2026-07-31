import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { isDraftId, loadDraft } from '@/lib/intake';
import { requireSession } from '@/lib/session';
import { draftPayloadSchema } from '@/lib/intake-schema';
import { ALL_IDENTIFIERS } from '@/lib/models';
import { IntakeWizard } from '@/components/intake-wizard';
import { discardDraft } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Intake' };

export default async function DraftPage(props: PageProps<'/intake/[draftId]'>) {
  const { draftId } = await props.params;
  const { operator } = await requireSession();
  if (!isDraftId(draftId)) notFound();

  const draft = await loadDraft(draftId);
  if (!draft) notFound();

  const parsed = draftPayloadSchema.safeParse(draft.payload ?? {});
  const payload = parsed.success ? parsed.data : {};

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake</h1>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            Started by {draft.started_by}
            {draft.identifier ? ` · ${draft.identifier}` : ''}
            {draft.serial ? ` · ${draft.serial}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/intake" className="text-fd-primary underline underline-offset-2">
            All drafts
          </Link>
          <form action={discardDraft.bind(null, draft.id)}>
            <button type="submit" className="text-fd-muted-foreground underline underline-offset-2">
              Discard
            </button>
          </form>
        </div>
      </div>

      {/* Feeds the Identifier field's datalist — 93 values, rendered once. */}
      <datalist id="identifier-options">
        {ALL_IDENTIFIERS.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      <IntakeWizard
        draftId={draft.id}
        initialStep={draft.step}
        initialPayload={payload}
        operator={operator}
      />
    </main>
  );
}
