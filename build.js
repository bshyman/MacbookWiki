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
    --header-h: 56px;
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
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif; }
  header {
    padding: 18px 28px 14px; border-bottom: 1px solid var(--border); background: var(--panel);
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
  header .back { color: var(--accent); text-decoration: none; font-size: 13px; }
  header .back:hover { text-decoration: underline; }
  header .spacer { flex: 1; }

  /* --- layout: sticky step nav + content ---------------------------------- */
  .layout {
    display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 34px;
    max-width: 1240px; margin: 0 auto; padding: 0 24px;
  }
  .stepnav {
    position: sticky; top: calc(var(--header-h) + 18px); align-self: start;
    max-height: calc(100vh - var(--header-h) - 36px); overflow-y: auto;
    padding: 24px 0 40px; font-size: 13px;
  }
  .stepnav .sn-group {
    color: var(--muted); font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 0 8px; margin: 16px 0 6px;
  }
  .stepnav .sn-group:first-child { margin-top: 0; }
  .stepnav a {
    display: flex; gap: 9px; align-items: baseline; text-decoration: none;
    color: var(--muted); padding: 5px 8px; border-radius: 6px; line-height: 1.35;
    border-left: 2px solid transparent; margin-left: -2px;
  }
  .stepnav a:hover { color: var(--text); background: var(--panel-2); text-decoration: none; }
  .stepnav a.is-active { color: var(--text); background: var(--panel-2); border-left-color: var(--accent); font-weight: 600; }
  .stepnav .sn-num {
    flex: 0 0 17px; text-align: right; font-variant-numeric: tabular-nums;
    font-size: 11.5px; color: var(--muted); font-weight: 600;
  }
  .stepnav a.is-active .sn-num { color: var(--accent); }

  main { max-width: 880px; padding: 28px 0 80px; }
  main h1 { font-size: 26px; letter-spacing: -0.01em; margin: 0 0 8px; }
  main h2 { font-size: 20px; letter-spacing: -0.01em; margin: 40px 0 10px; padding-top: 14px; border-top: 1px solid var(--border); }
  main h2:first-of-type { border-top: 0; padding-top: 0; }
  main h3 { font-size: 16px; color: var(--accent-2); margin: 24px 0 6px; }
  main h4 { font-size: 14px; margin: 16px 0 4px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  main h1, main h2, main h3, main h4 { scroll-margin-top: calc(var(--header-h) + 20px); }
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
  main hr { border: 0; border-top: 1px solid var(--border); margin: 30px 0; }
  main blockquote { border-left: 3px solid var(--accent); margin: 14px 0; padding: 8px 14px; color: var(--muted); background: var(--panel); border-radius: 0 6px 6px 0; }
  main blockquote p:first-child { margin-top: 0; }
  main blockquote p:last-child { margin-bottom: 0; }
  main ul, main ol { padding-left: 22px; }
  main li { margin: 3px 0; }

  /* "Next →" footers get pulled out as a call to action */
  main p.nextstep {
    background: var(--panel); border: 1px solid var(--border); border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0; padding: 10px 14px; margin: 22px 0 4px; font-size: 14px;
  }

  /* hover anchor on headings */
  .hlink {
    color: var(--muted); opacity: 0; margin-left: 8px; font-weight: 400; font-size: 0.8em;
    text-decoration: none;
  }
  h2:hover .hlink, h3:hover .hlink, .hlink:focus { opacity: 1; }

  /* copy button on code blocks */
  .prewrap { position: relative; }
  .prewrap pre { margin: 12px 0; }
  .copybtn {
    position: absolute; top: 18px; right: 8px; z-index: 2;
    background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
    border-radius: 6px; padding: 3px 9px; font: inherit; font-size: 11.5px; cursor: pointer;
    opacity: 0; transition: opacity .12s ease;
  }
  .prewrap:hover .copybtn, .copybtn:focus { opacity: 1; }
  .copybtn:hover { color: var(--text); border-color: var(--accent); }
  .copybtn.copied { color: var(--accent); border-color: var(--accent); opacity: 1; }

  @media (max-width: 900px) {
    .layout { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 0 18px; }
    .stepnav {
      position: static; max-height: none; overflow: visible;
      padding: 16px 0 0; border-bottom: 1px solid var(--border);
    }
    .stepnav nav { display: flex; flex-wrap: wrap; gap: 4px; }
    .stepnav .sn-group { width: 100%; margin: 8px 0 4px; padding: 0; }
    .stepnav a { border-left: 0; margin-left: 0; border: 1px solid var(--border); border-radius: 999px; padding: 4px 11px; }
    .stepnav a.is-active { border-color: var(--accent); }
    main { padding-top: 20px; }
    .copybtn { opacity: 1; }
  }
</style>
</head>
<body>
<header>
  <h1>MacBook Intake &amp; Assessment Workflow</h1>
  <span class="spacer"></span>
  <a class="back" href="/#terminal">Terminal commands&nbsp;↗</a>
  <a class="back" href="/">← MacBook Identification Wiki</a>
</header>
<div class="layout">
  <aside class="stepnav"><nav id="stepnav" aria-label="Steps"></nav></aside>
  <main>
${body}
  </main>
</div>
<script>
(function () {
  const main = document.querySelector('main');
  const header = document.querySelector('header');

  // Keep --header-h honest — the header wraps at narrow widths, and both the
  // sticky nav offset and heading scroll-margin key off it.
  const syncHeaderHeight = () => {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  };
  syncHeaderHeight();
  if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(header);
  else window.addEventListener('resize', syncHeaderHeight);

  // --- step nav, built from the rendered h2s so the markdown stays the source ---
  const headings = [...main.querySelectorAll('h2[id]')];
  const nav = document.getElementById('stepnav');

  const classify = (text) => {
    const step = text.match(/^Step\\s+(\\d+)\\s*[—–-]\\s*(.+)$/);
    if (step) return { group: 'Steps', num: step[1], label: step[2] };
    const ref = text.match(/^Reference\\s*[—–-]\\s*(.+)$/);
    if (ref) return { group: 'Reference', num: '', label: ref[1] };
    return { group: 'Overview', num: '', label: text };
  };

  let lastGroup = null;
  const links = headings.map(h => {
    const { group, num, label } = classify(h.textContent.trim());
    if (group !== lastGroup) {
      const g = document.createElement('div');
      g.className = 'sn-group';
      g.textContent = group;
      nav.appendChild(g);
      lastGroup = group;
    }
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.innerHTML = '<span class="sn-num">' + num + '</span><span class="sn-label"></span>';
    a.querySelector('.sn-label').textContent = label;
    nav.appendChild(a);
    return a;
  });

  // Scroll-spy. Geometric rather than IntersectionObserver: the markdown output is
  // flat (no section wrappers), so there's nothing section-sized to observe — a tall
  // step would leave the band empty and drop the highlight.
  let ticking = false;
  const setActive = () => {
    ticking = false;
    const line = header.offsetHeight + 28;
    let idx = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= line) idx = i; else break;
    }
    // Pin the last item once we've hit the bottom, otherwise short trailing
    // sections can never become active.
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
      idx = headings.length - 1;
    }
    links.forEach((a, i) => a.classList.toggle('is-active', i === idx));
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(setActive); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  setActive();

  // --- hover anchors on headings ---
  main.querySelectorAll('h2[id], h3[id]').forEach(h => {
    const a = document.createElement('a');
    a.className = 'hlink';
    a.href = '#' + h.id;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link to ' + h.textContent.trim());
    h.appendChild(a);
  });

  // --- copy button on every code block ---
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Non-secure context (plain http on a LAN address) has no clipboard API.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return ok;
    }
  };

  main.querySelectorAll('pre').forEach(pre => {
    const wrap = document.createElement('div');
    wrap.className = 'prewrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.className = 'copybtn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const ok = await copyText(pre.textContent.replace(/\\n$/, ''));
      btn.textContent = ok ? 'Copied' : 'Failed';
      btn.classList.toggle('copied', ok);
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
    });
    wrap.appendChild(btn);
  });

  // --- style the "Next →" step footers ---
  main.querySelectorAll('p').forEach(p => {
    if (/^Next\\s*→/.test(p.textContent.trim())) p.classList.add('nextstep');
  });
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, shell);
console.log(`Wrote ${OUT} (${shell.length.toLocaleString()} bytes)`);
