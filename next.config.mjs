// The path prefix the school's nginx mounts this app under (/tracks in
// production, empty for `npm run dev`). Baked in at build time — see
// src/lib/base-path.ts. nginx must pass the prefix THROUGH, not strip it.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` on scripts is not an oversight: Next.js injects its own
 * inline bootstrap and flight-data scripts, and the nonce alternative means
 * routing every response through middleware to stamp one in. This still shuts
 * the doors that matter for an app with no user-supplied HTML — no third-party
 * script origins, no plugins, and no framing by anyone else.
 *
 * `frame-src 'self'` is load-bearing: หน้าทรานสคริปต์ previews the generated
 * PDF in an iframe pointed at our own /api/transcript.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  basePath,
  // @react-pdf/renderer ships browser + node builds; keep it external on the server
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    // Big enough for the ตราโรงเรียน + ลายเซ็น the settings page sends as data
    // URLs, and no bigger. It was 200mb so a database restore could arrive
    // through a server action; that upload now streams to disk via
    // /api/backup/restore instead, so no other action has to inherit a ceiling
    // that let any signed-in user push 200 MB into memory.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Only meaningful over HTTPS, which is how the school's nginx serves
          // this; a plain-HTTP LAN deployment simply ignores it.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
