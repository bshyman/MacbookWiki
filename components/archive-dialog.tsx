'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archive } from '@/app/(home)/records/actions';

export interface ArchiveTarget {
  id: number;
  serial: string;
  identifier: string;
  name: string | null;
}

/**
 * Native <dialog> rather than a hand-rolled overlay — showModal() brings the
 * focus trap, the backdrop and Esc-to-close with it, and there's no UI library
 * here to borrow a modal from.
 */
export function ArchiveDialog({
  target,
  onDismiss,
}: {
  target: ArchiveTarget | null;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (target && !el.open) {
      setReason('');
      setError(null);
      el.showModal();
    } else if (!target && el.open) {
      el.close();
    }
  }, [target]);

  const submit = () => {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await archive(target.id, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDismiss();
      router.refresh();
    });
  };

  return (
    <dialog
      ref={ref}
      // Esc and backdrop dismissal both land here. Ignore them mid-write so the
      // dialog can't vanish while the action is still in flight.
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onDismiss();
      }}
      onClose={onDismiss}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-fd-border bg-fd-card p-0 text-fd-foreground backdrop:bg-black/50"
    >
      {target && (
        <div className="p-5">
          <h2 className="text-base font-semibold">Archive record #{target.id}?</h2>

          <div className="mt-3 rounded-lg border border-fd-border bg-fd-secondary/50 p-3 text-sm">
            <div className="font-mono text-xs">{target.serial}</div>
            <div className="mt-1 text-fd-muted-foreground">
              {target.name ? `${target.name} · ` : ''}
              {target.identifier}
            </div>
          </div>

          <p className="mt-3 text-sm text-fd-muted-foreground">
            It drops out of the records list, the CSV export, and the import duplicate check.
            The row itself stays in the ledger and you can restore it at any time.
          </p>

          <label className="mt-4 block text-xs text-fd-muted-foreground">
            Reason (optional)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. duplicate from the 14 Aug import"
              className="mt-1 w-full rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={pending}
              className="rounded-lg border border-fd-border px-4 py-2 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
