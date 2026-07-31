/**
 * RAM is binary (base 1024), storage is marketed decimal (base 1000) — pass the
 * base that matches the column. One copy: the review table and the records list
 * drifted apart once already.
 */
export function formatBytes(bytes: number | null, base: 1024 | 1000): string {
  if (bytes === null) return '—';
  if (bytes === 0) return 'None';
  if (base === 1000 && bytes >= 1000 ** 4) return `${bytes / 1000 ** 4} TB`;
  return `${Math.round(bytes / base ** 3)} GB`;
}
