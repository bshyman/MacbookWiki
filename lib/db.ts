import { Pool, types } from 'pg';

// node-postgres returns int8 as a string to avoid precision loss, which silently
// breaks every `id === someNumber` comparison. Nothing here goes near
// Number.MAX_SAFE_INTEGER — the largest value stored is a disk size in bytes
// (8 TB ≈ 8e12, versus a 9e15 ceiling) — so parse them as numbers.
types.setTypeParser(types.builtins.INT8, (v) => Number(v));

// Lazy — never touch DATABASE_URL at module scope. Next evaluates top-level module
// code during the build, so eager init crashes `next build` before env vars exist.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at your database.',
    );
  }

  pool = new Pool({
    connectionString,
    // Neon terminates idle connections; keep the pool small and short-lived so a
    // serverless invocation doesn't sit on one.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: true },
  });

  return pool;
}

// Constrained to `object` rather than Record<string, unknown> — interfaces don't
// get implicit index signatures, so the stricter bound rejects every row type.
export async function query<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
