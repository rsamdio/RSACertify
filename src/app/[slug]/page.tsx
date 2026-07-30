import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActivityBySlug } from "@/lib/server-data";
import { BrandMasthead } from "@/components/BrandMasthead";
import { JsonLd } from "@/components/JsonLd";
import { RichDescription } from "@/components/RichDescription";
import { SoftScrollLink } from "@/components/SoftScroll";
import { descriptionToPlainText } from "@/lib/rich-text";
import { formatActivityTrust } from "@/lib/trust-counts";
import { DEFAULT_OG_IMAGE, DEFAULT_SEO_KEYWORDS, SITE_URL } from "@/lib/site-seo";
import { ActivityClient } from "./ActivityClient";
import { ActivityOpenTracker } from "./ActivityOpenTracker";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity) return { title: "Activity not found" };
  const title = activity.title;
  const description =
    descriptionToPlainText(activity.description) ||
    `Download your verified certificate for ${activity.title} from Rotaract Certify.`;
  const ogImage = DEFAULT_OG_IMAGE;
  const keywords =
    activity.seo?.keywords?.trim() || DEFAULT_SEO_KEYWORDS;
  const url = `${SITE_URL}/${activity.slug}/`;
  return {
    title,
    description,
    keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | Rotaract Certify | Rotaract South Asia MDIO`,
      description,
      url,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Rotaract Certify | Rotaract South Asia MDIO`,
      description,
      images: [ogImage]
    }
  };
}

export default async function ActivityPage({ params }: Props) {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity || activity.status === "draft") {
    notFound();
  }

  const pageUrl = `https://certify.rsamdio.org/${activity.slug}/`;
  const plainDescription = descriptionToPlainText(activity.description);
  const trustLine = formatActivityTrust(
    activity.participantsCount,
    activity.certificatesCount
  );
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Rotaract Certify",
          item: "https://certify.rsamdio.org/"
        },
        {
          "@type": "ListItem",
          position: 2,
          name: activity.title,
          item: pageUrl
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": activity.date ? "Event" : "CreativeWork",
      name: activity.title,
      description: plainDescription,
      url: pageUrl,
      ...(activity.date
        ? {
            startDate: activity.date,
            eventStatus:
              activity.status === "active"
                ? "https://schema.org/EventScheduled"
                : "https://schema.org/EventCancelled",
            organizer: {
              "@type": "Organization",
              name: "Rotaract South Asia MDIO"
            }
          }
        : {
            publisher: {
              "@type": "Organization",
              name: "Rotaract South Asia MDIO"
            }
          })
    }
  ];

  return (
    <main className="container activity-page">
      <JsonLd data={jsonLd} />
      <ActivityOpenTracker slug={activity.slug} />
      <BrandMasthead
        compact
        lead="Download your verified certificate for this activity."
      />

      <p className="activity-back">
        <SoftScrollLink targetId="certificates">← Back to all certificates</SoftScrollLink>
      </p>

      <section className="card activity-hero rise">
        <div className="activity-hero-meta">
          {activity.date ? <time dateTime={activity.date}>{formatDate(activity.date)}</time> : null}
          <span className={`quiet-status${activity.status === "closed" ? " is-closed" : ""}`}>
            {activity.status === "active" ? "Available now" : "No longer available"}
          </span>
          {trustLine ? <span className="activity-trust-meta">{trustLine}</span> : null}
        </div>
        <h1 className="activity-hero-title">{activity.title}</h1>
        {activity.description ? (
          <RichDescription html={activity.description} className="activity-hero-lead" />
        ) : null}
      </section>

      <ActivityClient activity={activity} />
    </main>
  );
}
