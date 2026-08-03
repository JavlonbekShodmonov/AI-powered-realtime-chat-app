import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://summeet.live';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/demo'],
        disallow: ['/meeting', '/history', '/api', '/auth'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}