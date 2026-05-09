import type { MetadataRoute } from "next";

export const revalidate = 86400;

async function fetchPublicHandles(): Promise<string[]> {
  return [];
}

async function fetchPublicBookIds(): Promise<string[]> {
  return [];
}

async function fetchPublicListSlugs(): Promise<Array<{ handle: string; slug: string }>> {
  return [];
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://honebooks.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [handles, bookIds, listSlugs] = await Promise.all([
    fetchPublicHandles(),
    fetchPublicBookIds(),
    fetchPublicListSlugs(),
  ]);

  const profileUrls: MetadataRoute.Sitemap = handles.map((handle) => ({
    url: `${BASE_URL}/u/${handle}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const bookUrls: MetadataRoute.Sitemap = bookIds.map((id) => ({
    url: `${BASE_URL}/books/${id}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const listUrls: MetadataRoute.Sitemap = listSlugs.map(({ handle, slug }) => ({
    url: `${BASE_URL}/u/${handle}/lists/${slug}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [
    {
      url: BASE_URL,
      changeFrequency: "daily",
      priority: 1.0,
    },
    ...profileUrls,
    ...bookUrls,
    ...listUrls,
  ];
}
