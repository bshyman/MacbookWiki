'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';

const inputClass =
  'w-full rounded-lg border border-fd-border bg-fd-secondary px-3 py-2 text-sm text-fd-foreground';

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="operator" className="mb-1.5 block text-sm font-medium">
          Your name
        </label>
        <input
          id="operator"
          name="operator"
          required
          maxLength={80}
          autoComplete="name"
          placeholder="Who's running intake?"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-fd-muted-foreground">
          Stamped onto every record you commit this session. Permanent — records can&apos;t be
          edited afterwards.
        </p>
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Team password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-40"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
