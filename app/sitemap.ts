import type { MetadataRoute } from 'next';
import { blogSitemapEntries } from '@/lib/blog/sitemap';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
  'https://lienparental.fr';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const paths: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/',                        priority: 1.0, changeFrequency: 'weekly'  },
    { path: '/aide',                    priority: 0.6, changeFrequency: 'monthly' },
    { path: '/legal/mentions',          priority: 0.3, changeFrequency: 'yearly'  },
    { path: '/legal/cgu',               priority: 0.3, changeFrequency: 'yearly'  },
    { path: '/legal/confidentialite',   priority: 0.4, changeFrequency: 'yearly'  },
  ];

  return [
    ...paths.map(({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...(await blogSitemapEntries(SITE_URL)),
  ];
}
