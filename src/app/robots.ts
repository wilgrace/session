import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/landing/',
          '/privacy-policy',
          '/terms-of-service',
        ],
        disallow: [
          '/api/',
          '/onboarding',
          '/admin',
        ],
      },
    ],
    sitemap: 'https://bookasession.org/sitemap.xml',
  }
}
