import { firebasePublicConfig } from "@/lib/firebase-config";
import type { Activity, ParticipantField } from "@/types/domain";

export type CatalogRecord = {
  slug: string;
  title: string;
  description: string;
  date?: string;
  status: "active" | "closed";
  ogImage?: string;
  updatedAt?: number;
  seo?: {
    keywords?: string;
    author?: string;
    ogType?: string;
    ogImage?: string;
    schemaType?: string;
    robots?: string;
  };
};

const RTDB_BASE = firebasePublicConfig.databaseURL.replace(/\/$/, "");

/**
 * Public pages read from RTDB (cheap) — never from Firestore.
 * Lookup / download still use callables for PII.
 */
async function fetchRtdbJson<T>(path: string): Promise<T | null> {
  const url = `${RTDB_BASE}/${path.replace(/^\//, "")}.json`;
  const res = await fetch(url, {
    next: { revalidate: 60 },
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`RTDB fetch failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T | null;
}

export async function getCatalogActivities(): Promise<CatalogRecord[]> {
  try {
    const value = await fetchRtdbJson<Record<string, CatalogRecord> | null>("public/catalog");
    if (!value || typeof value !== "object") return [];
    return Object.values(value)
      .map((item) => ({
        slug: item.slug,
        title: item.title || item.slug,
        description: item.description || "",
        date: item.date || undefined,
        status: item.status === "closed" ? ("closed" as const) : ("active" as const),
        ogImage: undefined,
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : undefined,
        seo: item.seo
      }))
      .filter((item) => item.status === "active" && Boolean(item.slug))
      .sort((a, b) => (a.date && b.date ? b.date.localeCompare(a.date) : 0));
  } catch (err) {
    console.error("getCatalogActivities failed", err);
    return [];
  }
}

export async function getActivityBySlug(slug: string): Promise<Activity | null> {
  try {
    const raw = await fetchRtdbJson<Record<string, unknown> | null>(
      `public/activities/${encodeURIComponent(slug)}`
    );
    if (!raw) return null;
    const status = String(raw.status || "draft");
    if (status !== "active" && status !== "closed") return null;

    const templates = (raw.templates as Activity["templates"]) || {};
    const participantFields = Array.isArray(raw.participantFields)
      ? (raw.participantFields as ParticipantField[])
      : [];
    const seoRaw =
      raw.seo && typeof raw.seo === "object" ? (raw.seo as Record<string, unknown>) : undefined;
    const seo = seoRaw
      ? (() => {
          const { ogImage: _ignored, ...rest } = seoRaw;
          return Object.keys(rest).length ? (rest as Activity["seo"]) : undefined;
        })()
      : undefined;

    return {
      slug: String(raw.slug || slug),
      title: String(raw.title || slug),
      description: String(raw.description || ""),
      date: raw.date ? String(raw.date) : undefined,
      status: status as Activity["status"],
      seo,
      defaultTemplateKey: String(raw.defaultTemplateKey || ""),
      templates,
      participantFields,
      participantsCount:
        typeof raw.participantsCount === "number" ? raw.participantsCount : undefined,
      certificatesCount:
        typeof raw.certificatesCount === "number" ? raw.certificatesCount : undefined
    };
  } catch (err) {
    console.error("getActivityBySlug failed", err);
    return null;
  }
}
