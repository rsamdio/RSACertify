import type { MetadataRoute } from "next";
import { getCatalogActivities } from "@/lib/server-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const activities = await getCatalogActivities();
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    {
      url: "https://certify.rsamdio.org/",
      lastModified: now,
      changeFrequency: "daily",
      priority: 1
    },
    {
      url: "https://certify.rsamdio.org/privacy/",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3
    },
    {
      url: "https://certify.rsamdio.org/terms/",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3
    },
    {
      url: "https://certify.rsamdio.org/playbook/",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6
    }
  ];
  for (const activity of activities) {
    urls.push({
      url: `https://certify.rsamdio.org/${activity.slug}/`,
      lastModified: activity.updatedAt ? new Date(activity.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.8
    });
  }
  return urls;
}
