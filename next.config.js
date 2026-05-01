/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
              "frame-src 'self' https://*.daily.co; script-src 'self' 'unsafe-inline' https://*.daily.co;",
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
