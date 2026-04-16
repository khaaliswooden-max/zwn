/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 uses Turbopack by default. Turbopack handles browser polyfill
  // exclusions and WASM natively, so no additional configuration is needed.
  // The empty turbopack config signals that we intentionally use Turbopack.
  turbopack: {},

  // Webpack fallback config — only used when explicitly running `next build --webpack`
  // or `next dev --webpack`. Keeps @mkkellogg/gaussian-splats-3d working under webpack.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });
    return config;
  },
};

module.exports = nextConfig;
