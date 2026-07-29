# macbook-wiki

Two-page tool for identifying and grading MacBooks (2006–present). Both pages are organized
around the intake sheet columns an operator fills in:

```
Name  Serial  Identifier  Model  Battery  Year  RAM  HD  CPU
Physical Issues  Functional Issues  Firmware Locked  OS Reset  Processed At  Ingested By
```

- `public/index.html` — model identification table (every Intel and Apple Silicon MacBook since
  2006) with an **Identifier** filter that takes `sysctl -n hw.model` output directly, plus a
  Terminal-commands tab grouped by sheet column and a RAM size reference. Static HTML, no build step.
- `MacBook Assessment Workflow.md` — the guided procedure: a numbered Step 1→10 spine (physical
  inspection → device state → firmware password → Recovery → disk select → intake commands →
  battery → Activation Lock/MDM → Disk Utility → finish), each step ending by naming the next.
  Bottom half is a column-by-column command index. Rendered to `public/workflow.html` by the build.

Cross-links in both directions: the wiki's tab bar has an "Assessment workflow ↗" link to
`/workflow.html`; the rendered workflow links back to `/` and to `/#terminal`. Command groups are
deep-linkable — `/#terminal-battery` opens the Terminal tab scrolled to the Battery group.

## Conventions

- **Heading names are the search index.** Reference headers in the markdown and the `.cmd-group`
  headings in `index.html` use the exact sheet column names, so ⌘F for a column lands on the
  command that fills it. Renaming a column means renaming both.
- **The markdown is the only source for the workflow page.** `build.js` supplies the shell
  (sticky step nav, copy buttons, heading anchors) and builds the nav by walking rendered
  `h2[id]` at runtime — no step list is duplicated in the template.
- **Step headings must read `Step N — Title`.** The nav parses that shape to split the number
  from the label; `Reference — Title` groups under Reference. Anything else lands in Overview.

## Develop

```bash
npm install            # one-time
npm run build          # renders MacBook Assessment Workflow.md → public/workflow.html
npx wrangler dev       # local preview
```

## Deploy

Cloudflare Workers Assets (config in `wrangler.toml`):

```bash
npm run deploy         # runs build + wrangler deploy
```

`public/workflow.html` is committed alongside `index.html`, so the deploy step does not require the build to have just run — but `npm run deploy` ensures it's fresh.
