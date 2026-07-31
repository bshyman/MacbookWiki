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

  // Dev only. Next blocks cross-origin access to /_next/* dev resources, which
  // silently prevents hydration when the app is opened from anything other than
  // localhost — a LAN address from a phone on the bench, for instance.
  allowedDevOrigins: ['host.docker.internal', '192.168.1.200'],
};

export default withMDX(config);
