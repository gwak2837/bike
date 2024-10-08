import { CANONICAL_URL } from '@/common/constants'
import { type MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: CANONICAL_URL + '/sitemap.xml',
  }
}
