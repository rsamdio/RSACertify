import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { SiteFooter } from "@/components/SiteChrome";
import { JsonLd } from "@/components/JsonLd";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_SEO_KEYWORDS,
  DEFAULT_TITLE,
  SITE_URL
} from "@/lib/site-seo";
import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
  weight: ["400", "500", "600"]
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body-family",
  display: "swap",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | Rotaract Certify | Rotaract South Asia MDIO"
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_SEO_KEYWORDS.split(",").map((k) => k.trim()),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Rotaract Certify",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Rotaract Certify by Rotaract South Asia MDIO"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE]
  },
  icons: {
    icon: "/favicon.webp"
  }
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Rotaract Certify",
  url: SITE_URL,
  logo: `${SITE_URL}/assets/images/rsamdio.webp`,
  parentOrganization: {
    "@type": "Organization",
    name: "Rotaract South Asia MDIO",
    url: "https://rsamdio.org"
  },
  email: "rsamdio@gmail.com"
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Rotaract Certify",
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  publisher: {
    "@type": "Organization",
    name: "Rotaract South Asia MDIO"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <JsonLd data={[orgJsonLd, websiteJsonLd]} />
        <div className="site-shell">
          <div className="site-main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
