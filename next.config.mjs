/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // @react-pdf/renderer ships browser + node builds; keep it external on the server
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    // Database restore uploads a pg_dump archive through a server action; the
    // default 1 MB body cap would reject any real backup. The action enforces
    // its own limit (200 MB) — see src/app/admin/backup/actions.ts.
    serverActions: { bodySizeLimit: '200mb' },
  },
};

export default nextConfig;
