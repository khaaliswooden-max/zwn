/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @mkkellogg/gaussian-splats-3d web workers in Next.js
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent SSR from trying to process browser-only 3DGS worker modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    // Allow import of .wasm files used by 3DGS sorting workers
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
  },

  // Required for @mkkellogg/gaussian-splats-3d SharedArrayBuffer-based sorting
  // (only needed if sharedMemoryForWorkers: true — we use false by default to
  //  avoid COOP/COEP header requirements, but keeping here for reference)
  // async headers() {
  //   return [{
  //     source: '/(.*)',
  //     headers: [
  //       { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  //       { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  //     ],
  //   }];
  // },
};

module.exports = nextConfig;
