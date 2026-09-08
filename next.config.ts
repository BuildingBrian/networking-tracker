import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keeps the dev-mode overlay badge out of the README screenshots captured by
  // scripts/screenshots.mjs. Has no effect on production builds.
  devIndicators: false,
};

export default nextConfig;
