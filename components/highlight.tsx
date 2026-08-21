'use client';

/** Marks the search term inside a cell. Shared by the model lookup and the records table. */
export function Highlight({ text, needle }: { text: string | number; needle: string }) {
  const value = String(text);
  if (!needle) return <>{value}</>;
  const parts = value.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-fd-primary/20 px-0.5 text-fd-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
