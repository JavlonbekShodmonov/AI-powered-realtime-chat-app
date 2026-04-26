/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.daily.co",
              "frame-src https://*.daily.co",
              "connect-src 'self' wss://*.daily.co https://*.daily.co ws://localhost:* wss://localhost:* https://*.mongodb.net",
              "media-src 'self' https://*.daily.co blob:",
              "img-src 'self' data: https://*.daily.co",
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;