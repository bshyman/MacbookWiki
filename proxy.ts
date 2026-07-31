import { NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { docsContentRoute, docsRoute } from '@/lib/shared';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// Everything that reads or writes the ledger. The docs wiki stays public — it's
// reference material with no machine data in it.
const GATED = ['/intake', '/records'];

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`,
);

// Static assets never need a session check or markdown negotiation. Everything
// else stays in — /docs/foo.md must keep matching for the suffix rewrite, so no
// blanket has-a-dot exclusion.
export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = new URL('/signin', request.nextUrl);
      url.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  const result = rewriteSuffix(request.nextUrl.pathname);
  if (result) {
    return NextResponse.rewrite(new URL(result, request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    const result = rewriteDocs(request.nextUrl.pathname);

    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl), {
        // this URL has two representations, selected by `Accept`
        headers: { Vary: 'Accept' },
      });
    }
  }

  return NextResponse.next();
}
