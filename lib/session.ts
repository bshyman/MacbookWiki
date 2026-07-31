import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Session } from './auth';

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Every server action starts with this. proxy.ts already gates the routes, but
 * actions are POST endpoints callable by anything holding the action id, and
 * middleware-only authorization has been bypassable in Next before
 * (CVE-2025-29927). The check belongs next to the write, not just at the edge.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/signin');
  return session;
}
