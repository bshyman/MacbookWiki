# macbook-wiki

Two surfaces for identifying and grading MacBooks (2006–present), built on Next.js 16 + Fumadocs.

- **`/`** — model lookup table. Every Apple notebook since the Intel transition, filterable by
  **Identifier** (paste `sysctl -n hw.model` output straight in), family, era, and display size.
- **`/docs`** — the guided intake workflow: a numbered Step 1→10 spine plus a column-by-column
  command reference.

Both are organized around the intake sheet columns an operator fills in:

```
Name  Serial  Identifier  Model  Battery  Year  RAM  HD  CPU
Physical Issues  Functional Issues  Firmware Locked  OS Reset  Processed At  Ingested By
```

## Layout

| Path | What |
| --- | --- |
| `content/docs/` | The workflow, as MDX. Sidebar order lives in `meta.json` per folder |
| `lib/models.ts` | The 62-model dataset + identifier parsing helpers |
| `components/model-table.tsx` | Client-side filter/sort table |
| `lib/source.ts` | Fumadocs content source |
| `components/mdx.tsx` | MDX component registry (Tabs, Steps, plus Fumadocs defaults) |

## Conventions

- **Heading names are the search index.** Reference headings in
  `content/docs/reference/column-index.mdx` use the exact sheet column names, so searching a column
  name lands on the command that fills it. Renaming a column means renaming the heading.
- **Don't hand-write step navigation.** Fumadocs generates the sidebar, prev/next pagination, and
  the table of contents from `meta.json` and the page tree.
- **Architecture splits go in `<Tabs items={['Intel', 'Apple Silicon']}>`**, not two prose sections.
- **No raw JSX in indexed prose.** Component markup is stringified into the search index and
  `llms.txt`, so avoid decorative components in content that should stay searchable.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run types:check  # codegen + tsc --noEmit
```

## Deploy

Vercel. Search runs through `/api/search` (Orama, self-hosted — no external service).
