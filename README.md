# macbook-wiki

Two-page reference for identifying and grading MacBooks (2006–present).

- `public/index.html` — model identification table (every Intel and Apple Silicon MacBook since 2006), plus a Terminal-commands tab and a RAM size reference. Static HTML, no build step.
- `MacBook Assessment Workflow.md` — intake decision tree: physical inspection, Recovery entry, Intel/T2/Apple-Silicon nuances, battery-health strategy, Activation Lock / MDM checks. Rendered to `public/workflow.html` by the build.

Cross-links in both directions: the wiki's tab bar has an "Assessment workflow ↗" link to `/workflow.html`; the rendered workflow has a "← MacBook Identification Wiki" back-link to `/`.

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
