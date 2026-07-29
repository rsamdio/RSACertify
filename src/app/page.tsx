import { getCatalogActivities } from "@/lib/server-data";
import { BrandMasthead } from "@/components/BrandMasthead";
import { HomeCatalog } from "@/components/HomeCatalog";
import { HomeFaq } from "@/components/HomeFaq";
import { HowItWorks, SimilarTools } from "@/components/SiteChrome";
import { HomeScrollHandler } from "@/components/SoftScroll";
import { CatalogViewTracker } from "@/components/CatalogViewTracker";

export const revalidate = 300;

export default async function HomePage() {
  const activities = await getCatalogActivities();

  return (
    <main className="container public-home">
      <HomeScrollHandler />
      <CatalogViewTracker />
      <BrandMasthead asHeading />
      <HomeCatalog activities={activities} priority />
      <HowItWorks />
      <HomeFaq />
      <SimilarTools />
    </main>
  );
}
