import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: [
          '/api/',
          '/onboarding',
          '/sign-in',
          '/sign-up',
        ],
      },
      {
        userAgent: '*',
        disallow: '/*/admin',
      },
    ],
    sitemap: 'https://bookasession.org/sitemap.xml',
  }
}
