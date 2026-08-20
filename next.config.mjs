import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,

  // There's a stray package-lock.json in $HOME, and without this Turbopack infers
  // the home directory as the workspace root — which scopes file watching wrong.
  turbopack: {
    root: import.meta.dirname,
  },

  experimental: {
    // CSV import posts the whole file as a server-action argument. Default is
    // 1mb; a capped 2,000-row file is ~400 KB, so 4mb is generous headroom.
    // Don't raise this past 10mb without also raising proxyClientMaxBodySize —
    // the proxy matcher covers every path and buffers there first.
    serverActions: { bodySizeLimit: '4mb' },
  },

  // Dev only. Next blocks cross-origin access to /_next/* dev resources, which
  // silently prevents hydration when the app is opened from anything other than
  // localhost — a LAN address from a phone on the bench, for instance.
  allowedDevOrigins: ['host.docker.internal', '192.168.1.200'],
};

export default withMDX(config);
