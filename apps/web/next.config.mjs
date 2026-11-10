/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@dms/shared'],
  // Lint runs through the root `pnpm lint` (flat config); next's own lint pass does not know that config.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/v1/:path*` }];
  },
};
export default nextConfig;
