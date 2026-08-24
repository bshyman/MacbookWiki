/**
 * Shared by every server action that writes. Lives here rather than in an
 * actions file because Next forbids non-async exports from a 'use server'
 * module — and both intake and import need identical error wording.
 */

/** Turn Zod issues and Postgres constraint violations into something an operator can act on. */
export function messageFor(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
      return (err as { issues: { path: (string | number)[]; message: string }[] }).issues
        .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
        .join('; ');
    }
    const code = (err as { code?: string }).code;
    // A correction already exists for this record — the chain stays linear.
    if (code === '23505') return 'That record already has a correction.';
    if (code === '23514') return 'A value failed a database constraint.';
    // Archiving an id that isn't in the ledger — stale page, or a hand-made request.
    if (code === '23503') return 'That record no longer exists.';
    // Raised by the append-only triggers.
    if (code === '23001') return 'Committed records cannot be modified.';
  }
  // Anything else is a server problem — pg errors and network failures name
  // internal hosts, so the text stays out of the client. Log it here instead.
  console.error('intake action failed:', err);
  return 'Something went wrong writing to the database.';
}
