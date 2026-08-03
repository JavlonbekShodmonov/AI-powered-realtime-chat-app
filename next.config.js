/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@xenova/transformers"],
  },
  async rewrites() {
    return [
      {
        source: "/api/history/:path*",
        destination: `${"http://localhost:3001"}/api/history/:path*`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@xenova/transformers": "@xenova/transformers/src/transformers.js",
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
      // Exclude native node modules from client bundle
      config.externals = [
        ...(config.externals || []),
        { "onnxruntime-node": "commonjs onnxruntime-node" },
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/meeting/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' script-src 'self' 'unsafe-inline' 'unsafe-eval' ",
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;