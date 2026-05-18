import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const SOURCE = 'MacBook Assessment Workflow.md';
const OUT = 'public/workflow.html';

const md = readFileSync(SOURCE, 'utf-8');

marked.use(gfmHeadingId());
marked.use({ gfm: true });

const body = marked.parse(md);

const shell = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MacBook Intake & Assessment Workflow</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #161a22;
    --panel-2: #1c2230;
    --border: #2a3142;
    --text: #e7ecf3;
    --muted: #9aa3b2;
    --accent: #7ab8ff;
    --accent-2: #ffd166;
    --row: #131722;
    --row-alt: #171c28;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f5f7fa;
      --panel: #ffffff;
      --panel-2: #f0f3f8;
      --border: #d8dee9;
      --text: #1b2230;
      --muted: #5a6679;
      --accent: #2563eb;
      --accent-2: #b45309;
      --row: #ffffff;
      --row-alt: #f5f7fa;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif; }
  header {
    padding: 18px 28px 14px; border-bottom: 1px solid var(--border); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
  header .back { color: var(--accent); text-decoration: none; font-size: 13px; }
  header .back:hover { text-decoration: underline; }
  main { max-width: 880px; margin: 0 auto; padding: 28px 24px 60px; }
  main h1 { font-size: 26px; letter-spacing: -0.01em; margin: 0 0 8px; }
  main h2 { font-size: 20px; letter-spacing: -0.01em; margin: 36px 0 10px; padding-top: 12px; border-top: 1px solid var(--border); }
  main h2:first-of-type { border-top: 0; padding-top: 0; }
  main h3 { font-size: 16px; color: var(--accent-2); margin: 22px 0 6px; }
  main h4 { font-size: 14px; margin: 16px 0 4px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  main p, main li { color: var(--text); }
  main a { color: var(--accent); text-decoration: none; }
  main a:hover { text-decoration: underline; }
  main code {
    background: var(--panel-2); padding: 1px 5px; border-radius: 4px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em;
  }
  main pre {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 14px; overflow-x: auto;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5;
  }
  main pre code { background: transparent; padding: 0; font-size: inherit; }
  main table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13.5px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  main th, main td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  main th { background: var(--panel-2); font-weight: 600; }
  main tr:last-child td { border-bottom: 0; }
  main hr { border: 0; border-top: 1px solid var(--border); margin: 28px 0; }
  main blockquote { border-left: 3px solid var(--accent); margin: 12px 0; padding: 4px 14px; color: var(--muted); background: var(--panel); border-radius: 0 6px 6px 0; }
  main ul, main ol { padding-left: 22px; }
  main li { margin: 3px 0; }
</style>
</head>
<body>
<header>
  <h1>MacBook Intake & Assessment Workflow</h1>
  <a class="back" href="/">← MacBook Identification Wiki</a>
</header>
<main>
${body}
</main>
</body>
</html>
`;

writeFileSync(OUT, shell);
console.log(`Wrote ${OUT} (${shell.length.toLocaleString()} bytes)`);
