'use client';

import { useEffect } from 'react';

const PREFIX = 'intake-draft:';

/**
 * Committing clears the local copy, but discarding runs server-side and can't —
 * so serials from dead drafts pile up in localStorage on a shared bench machine.
 * This sweeps any intake-draft key whose draft no longer exists server-side.
 */
export function LocalDraftPruner({ liveIds }: { liveIds: string[] }) {
  useEffect(() => {
    try {
      const live = new Set(liveIds);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(PREFIX) && !live.has(key.slice(PREFIX.length))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* private mode */
    }
  }, [liveIds]);

  return null;
}
