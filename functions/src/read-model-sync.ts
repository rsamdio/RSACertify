import { fn } from './runtime';
import { getAdmin } from './admin';

type PublicCatalogItem = {
  slug: string;
  title: string;
  description: string;
  date: string | null;
  status: string;
  ogImage: string;
  updatedAt: number;
  seo?: Record<string, unknown>;
};

type PublicActivityPayload = PublicCatalogItem & {
  defaultTemplateKey: string;
  templates: Record<string, { url: string; fields?: Record<string, unknown> }>;
  participantFields: unknown[];
  participantsCount: number;
  certificatesCount: number;
};

/**
 * Fields that affect the RTDB/Firestore catalog fan-out. `participantsCount`,
 * `certificatesCount`, and `updatedAt` are deliberately excluded — those are
 * already mirrored by `syncCountersToRealtime`, and during large bulk imports
 * every participant write touches this doc's counters, so re-running the full
 * catalog fan-out per write would be a large, avoidable cost.
 */
const CATALOG_METADATA_FIELDS = [
  'slug',
  'title',
  'description',
  'status',
  'date',
  'seo',
  'templates',
  'defaultTemplateKey',
  'participantFields'
] as const;

function hasCatalogMetadataChanged(
  before: FirebaseFirestore.DocumentData,
  after: FirebaseFirestore.DocumentData
): boolean {
  return CATALOG_METADATA_FIELDS.some(
    (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)
  );
}

/**
 * Mirror activity docs into:
 * - RTDB activities/catalog/{slug} (admin list; includes drafts)
 * - RTDB public/catalog/{slug} (homepage; active only)
 * - RTDB public/activities/{slug} (public page render; active + closed)
 * - Firestore public/catalog/items/{slug} (legacy; kept in sync for safety)
 */
export const syncActivityCatalogToRtdb = fn.firestore
  .document('activities/{activitySlug}')
  .onWrite(async (change, context) => {
    const slug = context.params.activitySlug;
    const db = getAdmin().database();
    const firestore = getAdmin().firestore();

    const adminCatalogRef = db.ref(`activities/catalog/${slug}`);
    const publicCatalogRef = db.ref(`public/catalog/${slug}`);
    const publicActivityRef = db.ref(`public/activities/${slug}`);
    const firestoreCatalogRef = firestore.doc(`public/catalog/items/${slug}`);

    if (!change.after.exists) {
      await Promise.all([
        adminCatalogRef.remove().catch(() => undefined),
        publicCatalogRef.remove().catch(() => undefined),
        publicActivityRef.remove().catch(() => undefined),
        db.ref(`activities/${slug}`).remove().catch(() => undefined),
        firestoreCatalogRef.delete().catch(() => undefined)
      ]);
      return;
    }

    const data = change.after.data() || {};

    if (change.before.exists) {
      const beforeData = change.before.data() || {};
      if (!hasCatalogMetadataChanged(beforeData, data)) {
        // Only counters/updatedAt changed (e.g. bulk import participant writes) —
        // keep RTDB counts fresh without re-running the full catalog fan-out
        // (templates, participant fields, Firestore mirror, etc).
        const participantsCount = Number(data.participantsCount || 0);
        const certificatesCount = Number(data.certificatesCount || 0);
        const status = String(data.status || 'draft');
        await adminCatalogRef.update({ participantsCount, certificatesCount }).catch(() => undefined);
        if (status === 'active' || status === 'closed') {
          await publicActivityRef
            .update({ participantsCount, certificatesCount })
            .catch(() => undefined);
        }
        return;
      }
    }

    const status = String(data.status || 'draft');
    const updatedAt = Date.now();

    const templatesRaw = (data.templates || {}) as Record<
      string,
      { url?: string; fields?: Record<string, unknown> }
    >;
    const templates: Record<string, { url: string; fields?: Record<string, unknown> }> = {};
    for (const [key, value] of Object.entries(templatesRaw)) {
      if (!value?.url) continue;
      templates[key] = {
        url: String(value.url),
        ...(value.fields && typeof value.fields === 'object' ? { fields: value.fields } : {})
      };
    }

    const catalogPayload: PublicCatalogItem = {
      slug,
      title: String(data.title || ''),
      description: String(data.description || ''),
      date: data.date ? String(data.date) : null,
      status,
      ogImage: String(data?.seo?.ogImage || ''),
      updatedAt,
      seo: (data.seo && typeof data.seo === 'object' ? data.seo : {}) as Record<string, unknown>
    };

    const publicActivityPayload: PublicActivityPayload = {
      ...catalogPayload,
      defaultTemplateKey: String(data.defaultTemplateKey || ''),
      templates,
      participantFields: Array.isArray(data.participantFields) ? data.participantFields : [],
      participantsCount: Number(data.participantsCount || 0),
      certificatesCount: Number(data.certificatesCount || 0)
    };

    // Admin RTDB catalog includes drafts for organizer workspace.
    await adminCatalogRef.set({
      ...catalogPayload,
      participantsCount: publicActivityPayload.participantsCount,
      certificatesCount: publicActivityPayload.certificatesCount
    });

    if (status === 'active') {
      await publicCatalogRef.set(catalogPayload);
      await publicActivityRef.set(publicActivityPayload);
      await firestoreCatalogRef.set(catalogPayload, { merge: true });
    } else if (status === 'closed') {
      // Closed: keep public activity page, remove from homepage catalog.
      await publicCatalogRef.remove().catch(() => undefined);
      await publicActivityRef.set(publicActivityPayload);
      await firestoreCatalogRef.delete().catch(() => undefined);
    } else {
      // Draft: private to organizers.
      await publicCatalogRef.remove().catch(() => undefined);
      await publicActivityRef.remove().catch(() => undefined);
      await firestoreCatalogRef.delete().catch(() => undefined);
    }
  });

export const syncParticipantIndexToRtdb = fn.firestore
  .document('activities/{activitySlug}/participants/{participantId}')
  .onWrite(async (change, context) => {
    const { activitySlug, participantId } = context.params;
    const ref = getAdmin().database().ref(`activities/${activitySlug}/participants/index/${participantId}`);
    if (!change.after.exists) {
      await ref.remove();
      return;
    }
    const data = change.after.data() || {};
    await ref.set({
      id: participantId,
      name: data.name || '',
      lookup: data.lookup || '',
      certificateStatus: data.certificateStatus || 'pending',
      templateKey: data.templateKey || '',
      additionalFields: data.additionalFields || {},
      updatedAt: Date.now()
    });
  });

export const syncCatalogToFirestore = fn.database
  .ref('activities/catalog/{activitySlug}')
  .onWrite(async () => {
    return;
  });
