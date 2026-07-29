"use client";

import Link from "next/link";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import type { Activity, ActivityStatus, FieldPlacement, Participant, ParticipantField } from "@/types/domain";
import { renderCertificateCanvas } from "@/lib/certificate/renderer";
import { CERTIFICATE_FONTS, normalizeHexColor } from "@/lib/certificate-fonts";
import { slugify } from "@/lib/activity-defaults";
import { fetchAuthedRtdbJson } from "@/lib/rtdb-rest";
import {
  addFieldPlacementToAllDesigns,
  hydrateActivityPlacements,
  removeFieldPlacementFromAllDesigns,
  resolveDesignKey,
  resolveFieldsForDesign,
  seedTemplateFields,
  stripParticipantFieldsToSchema,
  toFieldSchema,
  updateDesignFieldPlacement
} from "@/lib/field-placement";
import { parseCsv } from "@/lib/csv";
import { getFirebaseServices } from "@/lib/firebase-client";
import {
  bulkUploadParticipants,
  getTemplateUploadUrl,
  inviteActivityManager,
  removeActivityManager,
  syncAdminClaims
} from "@/lib/callables";
import {
  existingLookupSet,
  isReservedDesignKey,
  parseImportCsvTable,
  validateImportRows,
  type ImportDraftRow,
  type ValidatedImportRow
} from "@/lib/import-validate";
import { toLookupKey, toLookupDocId } from "@/lib/security";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CertificateFontsLink } from "@/components/CertificateFontsLink";
import { DateField } from "@/components/admin/DateField";
import { AdminSelect } from "@/components/admin/AdminSelect";

type TabKey = "details" | "participants" | "templates" | "layout" | "managers";
type ImportMode = "source" | "pickSheet" | "review";

const TABS: Array<[TabKey, string]> = [
  ["details", "Details"],
  ["templates", "Design"],
  ["layout", "Placement"],
  ["participants", "People"],
  ["managers", "Managers"]
];

type Props = {
  slug: string;
};

type ParticipantRow = Participant & { additionalFields?: Record<string, string> };

type ManagerRow = { uid: string; email?: string };

function isTabKey(value: string | null): value is TabKey {
  return Boolean(value && TABS.some(([key]) => key === value));
}

const PEOPLE_PAGE_SIZE = 50;
const MAX_TEMPLATE_EDGE_PX = 3000;
const BULK_CHUNK_SIZE = 5000;

function isCustomField(field: ParticipantField): boolean {
  return field.key !== "name" && field.key !== "lookup";
}

const DESIGN_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;

function normalizeDesignKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isValidDesignKey(key: string): boolean {
  return DESIGN_KEY_PATTERN.test(key) && !isReservedDesignKey(key);
}

function designKeyInputError(raw: string): string {
  if (!raw) return "";
  if (isReservedDesignKey(raw)) {
    return "“default” is reserved. Choose another design key (blank design on import follows the activity default).";
  }
  if (!/^[a-z0-9_-]*$/.test(raw)) {
    return "Use lowercase letters, numbers, hyphen, or underscore only. No spaces.";
  }
  if (raw.length > 64) return "Design key must be at most 64 characters.";
  return "";
}

function toPercent(value: string | number): string {
  if (typeof value === "number") return `${((value / 794) * 100).toFixed(1)}%`;
  if (value.includes("%")) return value;
  const num = parseFloat(value);
  return Number.isFinite(num) ? `${num}%` : "50%";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, rows: string[]) {
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ActivityEditorClient({ slug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingTab, startTabTransition] = useTransition();

  const tabParam = searchParams.get("tab");
  const tab: TabKey = isTabKey(tabParam) ? tabParam : "details";

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importChunkProgress, setImportChunkProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [sheetUrl, setSheetUrl] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("source");
  const [importDraft, setImportDraft] = useState<ImportDraftRow[]>([]);
  const [sheetOptions, setSheetOptions] = useState<Array<{ name: string; gid: string }>>([]);
  const [selectedSheetGid, setSelectedSheetGid] = useState("");
  const [pendingSheetUrl, setPendingSheetUrl] = useState("");
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [previewName, setPreviewName] = useState("Sample Participant");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTemplateKey, setPreviewTemplateKey] = useState("");
  const [designName, setDesignName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingDesignKey, setEditingDesignKey] = useState<string | null>(null);
  const [editDesignName, setEditDesignName] = useState("");
  const [editDesignFile, setEditDesignFile] = useState<File | null>(null);

  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [participantQuery, setParticipantQuery] = useState("");
  const [peoplePage, setPeoplePage] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [placementMobileGate, setPlacementMobileGate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLookup, setNewLookup] = useState("");
  const [newDesignKey, setNewDesignKey] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [csvFileName, setCsvFileName] = useState("");
  const [csvPreviewCount, setCsvPreviewCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLookup, setEditLookup] = useState("");
  const [editDesignKey, setEditDesignKey] = useState("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [managerEmail, setManagerEmail] = useState("");

  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => Promise<void> | void;
    followUp?: {
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean;
    };
  }>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [draftSlug, setDraftSlug] = useState("");
  const [slugEditing, setSlugEditing] = useState(false);
  const [slugBusy, setSlugBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashOk(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setError("");
    setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(""), 3200);
  }

  function setTab(next: TabKey) {
    startTabTransition(() => {
      router.replace(`/admin/activities/${slug}?tab=${next}`, { scroll: false });
    });
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await syncAdminClaims().catch(() => undefined);
        const { auth, db } = getFirebaseServices();
        const token = await auth.currentUser?.getIdTokenResult();
        const role = String(token?.claims.role || "");
        if (!cancelled) setCanDelete(role === "super" || role === "platform");
        const snap = await getDoc(doc(db, "activities", slug));
        if (!snap.exists()) {
          if (!cancelled) setError("Activity not found.");
          return;
        }
        const data = hydrateActivityPlacements({
          slug,
          ...(snap.data() as Omit<Activity, "slug">)
        });
        if (!cancelled) {
          setActivity(data);
          setDraftSlug(data.slug);
          setSlugEditing(false);
          setPreviewTemplateKey(data.defaultTemplateKey || Object.keys(data.templates || {})[0] || "");
          setNewDesignKey("");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Unable to load activity.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setPlacementMobileGate(tab === "layout" && mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [tab]);

  async function reloadParticipants() {
    const { auth } = getFirebaseServices();
    const user = auth.currentUser;
    if (!user) {
      setParticipants([]);
      setPeopleLoaded(true);
      return;
    }
    const idToken = await user.getIdToken();
    const value =
      (await fetchAuthedRtdbJson<Record<string, ParticipantRow> | null>(
        `activities/${slug}/participants/index`,
        idToken
      )) ?? {};
    const rows = Object.entries(value).map(([id, row]) => ({ ...row, id }));
    rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    setParticipants(rows);
    setPeopleLoaded(true);
  }

  useEffect(() => {
    setPeopleLoaded(false);
    setParticipants([]);
  }, [slug]);

  useEffect(() => {
    if (tab !== "participants") return;
    let cancelled = false;
    (async () => {
      try {
        await reloadParticipants();
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Unable to load people. Please switch tabs and try again.");
          setParticipants([]);
          setPeopleLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when entering People for this slug
  }, [slug, tab]);

  useEffect(() => {
    (async () => {
      const { db } = getFirebaseServices();
      const snap = await getDocs(collection(db, "activities", slug, "managers"));
      setManagers(snap.docs.map((d) => ({ uid: d.id, email: d.data().email })));
    })().catch(console.error);
  }, [slug]);

  const filteredParticipants = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.lookup?.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [participants, participantQuery]);

  const pagedParticipants = useMemo(() => {
    const start = peoplePage * PEOPLE_PAGE_SIZE;
    return filteredParticipants.slice(start, start + PEOPLE_PAGE_SIZE);
  }, [filteredParticipants, peoplePage]);

  const peoplePageCount = Math.max(1, Math.ceil(filteredParticipants.length / PEOPLE_PAGE_SIZE) || 1);

  const peopleCount = peopleLoaded
    ? participants.length
    : Number(activity?.participantsCount || 0);
  const downloadedCount = peopleLoaded
    ? participants.filter((p) => p.certificateStatus === "downloaded").length
    : Number(activity?.certificatesCount || 0);
  const downloadPercent =
    peopleCount > 0 ? Math.round((downloadedCount / peopleCount) * 100) : 0;

  const customFields = useMemo(
    () => (activity ? activity.participantFields.filter(isCustomField) : []),
    [activity]
  );

  const activeDesignKey = useMemo(() => {
    if (!activity) return "";
    return resolveDesignKey(activity, previewTemplateKey);
  }, [activity, previewTemplateKey]);

  const placementFields = useMemo(() => {
    if (!activity || !activeDesignKey) return [];
    return resolveFieldsForDesign(activity, activeDesignKey)
      .map((field) => ({ field }))
      .filter(({ field }) => field.onCertificate !== false);
  }, [activity, activeDesignKey]);

  const hasTemplate = Boolean(activity && Object.keys(activity.templates || {}).length > 0);
  const canPlaceFields = hasTemplate && placementFields.length > 0;
  const designKeys = useMemo(
    () => (activity ? Object.keys(activity.templates || {}).sort() : []),
    [activity]
  );

  const designOptions = useMemo(
    () =>
      designKeys.map((key) => ({
        value: key,
        label: key === activity?.defaultTemplateKey ? `${key} (default)` : key
      })),
    [activity?.defaultTemplateKey, designKeys]
  );

  const personDesignOptions = useMemo(
    () => [{ value: "", label: "Default (activity)" }, ...designOptions],
    [designOptions]
  );

  const designKeySet = useMemo(() => new Set(designKeys), [designKeys]);

  const validatedImportRows: ValidatedImportRow[] = useMemo(
    () =>
      validateImportRows(importDraft, {
        existingLookups: existingLookupSet(participants),
        designKeys: designKeySet
      }),
    [designKeySet, importDraft, participants]
  );

  const importAllOk =
    validatedImportRows.length > 0 && validatedImportRows.every((row) => row.ok);

  function displayDesignLabel(row: ParticipantRow): string {
    if (!row.templateKey) {
      return activity?.defaultTemplateKey
        ? `${activity.defaultTemplateKey} · default`
        : "Default";
    }
    return row.templateKey;
  }

  function resetImportSourceUi() {
    setCsvFileName("");
    setCsvPreviewCount(0);
    setSheetUrl("");
    setPendingSheetUrl("");
    setSheetOptions([]);
    setSelectedSheetGid("");
    setImportDraft([]);
    setImportMode("source");
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
  }

  function enterImportReview(rows: ImportDraftRow[], sourceLabel: string) {
    setImportDraft(rows);
    setCsvFileName(sourceLabel);
    setCsvPreviewCount(rows.length);
    setImportMode("review");
  }

  async function saveActivity(
    next: Activity,
    okMessage = "Saved.",
    options?: { removeTemplateKeys?: string[] }
  ): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const { db } = getFirebaseServices();
      const removeKeys = options?.removeTemplateKeys || [];
      const payload: Record<string, unknown> = {
        ...next,
        updatedAt: serverTimestamp()
      };
      if (removeKeys.length) {
        const templatesWrite: Record<string, unknown> = { ...(next.templates || {}) };
        for (const key of removeKeys) {
          templatesWrite[key] = deleteField();
        }
        payload.templates = templatesWrite;
      }
      await setDoc(doc(db, "activities", slug), payload, { merge: true });
      setActivity(next);
      flashOk(okMessage);
      return true;
    } catch (err) {
      console.error(err);
      setError("Save failed. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function copySubcollection(fromPath: string, toPath: string) {
    const { db } = getFirebaseServices();
    const snap = await getDocs(collection(db, fromPath));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.set(doc(db, toPath, d.id), d.data());
      n += 1;
      if (n >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        n = 0;
      }
    }
    if (n > 0) await batch.commit();
  }

  async function deleteSubcollection(path: string) {
    const { db } = getFirebaseServices();
    const snap = await getDocs(collection(db, path));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n += 1;
      if (n >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        n = 0;
      }
    }
    if (n > 0) await batch.commit();
  }

  async function renameActivitySlug(nextSlug: string) {
    if (!activity) return;
    const { db } = getFirebaseServices();
    const target = doc(db, "activities", nextSlug);
    const existing = await getDoc(target);
    if (existing.exists()) {
      throw new Error("An activity with this slug already exists.");
    }

    const payload: Omit<Activity, "slug"> & { slug: string } = {
      ...activity,
      slug: nextSlug
    };
    await setDoc(target, {
      ...payload,
      updatedAt: serverTimestamp()
    });

    await copySubcollection(`activities/${slug}/participants`, `activities/${nextSlug}/participants`);
    await copySubcollection(`activities/${slug}/managers`, `activities/${nextSlug}/managers`);
    await copySubcollection(`activities/${slug}/lookupKeys`, `activities/${nextSlug}/lookupKeys`);

    await deleteSubcollection(`activities/${slug}/participants`);
    await deleteSubcollection(`activities/${slug}/managers`);
    await deleteSubcollection(`activities/${slug}/lookupKeys`);
    await deleteDoc(doc(db, "activities", slug));

    router.replace(`/admin/activities/${nextSlug}?tab=details`);
  }

  async function onSaveDetails(e: FormEvent) {
    e.preventDefault();
    if (!activity) return;
    const publishing = activity.status === "active";
    // Slug renames are intentional and go through requestSlugUpdate — never via Save details.
    // Sitewide OG image only — do not persist per-activity share image URLs.
    const { ogImage: _dropOg, ...seoRest } = activity.seo || {};
    const ok = await saveActivity(
      { ...activity, slug, seo: Object.keys(seoRest).length ? seoRest : undefined },
      "Details saved."
    );
    if (ok && publishing) {
      setShareOpen(true);
    }
  }

  function beginSlugEdit() {
    setDraftSlug(slug);
    setSlugEditing(true);
    setError("");
  }

  function cancelSlugEdit() {
    setDraftSlug(slug);
    setSlugEditing(false);
  }

  function requestSlugUpdate() {
    if (!activity) return;
    const nextSlug = slugify(draftSlug);
    if (!nextSlug) {
      setError("Web address cannot be empty.");
      return;
    }
    if (nextSlug === slug) {
      setSlugEditing(false);
      return;
    }

    askConfirm({
      title: "Change web address?",
      body: `You are about to rename “/${slug}” to “/${nextSlug}”. Anyone with the old link will no longer reach this activity. People, managers, and designs will move with it.`,
      confirmLabel: "Continue",
      danger: true,
      followUp: {
        title: "Confirm again",
        body: `This cannot be undone easily. Old bookmarks and shared links to /${slug} will break. Permanently change the address to /${nextSlug}?`,
        confirmLabel: "Yes, change permanently",
        danger: true
      },
      action: async () => {
        setSlugBusy(true);
        setError("");
        try {
          await renameActivitySlug(nextSlug);
          setSlugEditing(false);
          flashOk("Web address updated.");
        } catch (err) {
          console.error(err);
          setError(
            err instanceof Error && err.message.includes("already exists")
              ? err.message
              : "Could not change the web address. Please try again."
          );
        } finally {
          setSlugBusy(false);
        }
      }
    });
  }

  async function onSaveFields() {
    if (!activity) return;
    const next = hydrateActivityPlacements({
      ...activity,
      participantFields: stripParticipantFieldsToSchema(activity.participantFields) as ParticipantField[]
    });
    await saveActivity(next, "Certificate fields saved.");
  }

  function askConfirm(input: {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => Promise<void> | void;
    followUp?: {
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean;
    };
  }) {
    setConfirmState(input);
  }

  async function runConfirm() {
    if (!confirmState) return;
    if (confirmState.followUp) {
      const { followUp, action } = confirmState;
      setConfirmState({
        title: followUp.title,
        body: followUp.body,
        confirmLabel: followUp.confirmLabel,
        danger: followUp.danger ?? true,
        action
      });
      return;
    }
    setConfirmBusy(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      console.error(err);
      setError("That action failed. Please try again.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function onDeleteActivity() {
    if (!activity || !canDelete) return;
    askConfirm({
      title: "Delete this activity?",
      body: `Permanently delete “${activity.title}” along with its people list and managers. This cannot be undone.`,
      confirmLabel: "Delete activity",
      danger: true,
      action: async () => {
        setDeleting(true);
        setError("");
        const { db } = getFirebaseServices();
        const batchDelete = async (path: string) => {
          const snap = await getDocs(collection(db, path));
          let batch = writeBatch(db);
          let n = 0;
          for (const d of snap.docs) {
            batch.delete(d.ref);
            n += 1;
            if (n >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              n = 0;
            }
          }
          if (n > 0) await batch.commit();
        };
        await batchDelete(`activities/${slug}/participants`);
        await batchDelete(`activities/${slug}/managers`);
        await batchDelete(`activities/${slug}/lookupKeys`);
        await deleteDoc(doc(db, "activities", slug));
        router.push("/admin/activities");
      }
    });
  }

  async function uploadDesignWithKey(key: string) {
    if (!activity || !uploadFile) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(uploadFile);
        img.onload = () => {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not read image"));
        };
        img.src = url;
      });
      if (Math.max(dims.w, dims.h) > MAX_TEMPLATE_EDGE_PX) {
        throw new Error(
          `Design is too large (${dims.w}×${dims.h}). Longest edge must be ≤ ${MAX_TEMPLATE_EDGE_PX}px for reliable mobile downloads.`
        );
      }
      const upload = await getTemplateUploadUrl({
        activitySlug: slug,
        templateKey: key,
        contentType: "image/png",
        contentLength: uploadFile.size
      });
      const put = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.headers,
        body: uploadFile
      });
      if (!put.ok) throw new Error("Upload failed");
      const hadNoTemplates = Object.keys(activity.templates || {}).length === 0;
      const existing = activity.templates[key];
      const seeded = existing?.url
        ? {
            url: upload.templateUrl,
            fields:
              existing.fields && Object.keys(existing.fields).length
                ? existing.fields
                : seedTemplateFields(activity, key, upload.templateUrl).fields
          }
        : seedTemplateFields(activity, key, upload.templateUrl);
      const next: Activity = hydrateActivityPlacements({
        ...activity,
        defaultTemplateKey: hadNoTemplates ? key : activity.defaultTemplateKey || key,
        templates: {
          ...activity.templates,
          [key]: seeded
        },
        participantFields: stripParticipantFieldsToSchema(
          activity.participantFields
        ) as ParticipantField[]
      });
      const ok = await saveActivity(next, `Design “${key}” uploaded.`);
      if (!ok) return;
      setUploadFile(null);
      setDesignName("");
      if (hadNoTemplates || !previewTemplateKey) {
        setPreviewTemplateKey(key);
      }
      if (hadNoTemplates) {
        setNewDesignKey("");
      }
    } catch (err) {
      console.error(err);
      setError("Design upload failed. Please try again.");
      setSaving(false);
    }
  }

  async function onUploadTemplate(e: FormEvent) {
    e.preventDefault();
    if (!activity || !uploadFile) return;
    const key = normalizeDesignKey(designName);
    if (!key || !isValidDesignKey(key)) {
      setError("Design key must be 1–64 characters: lowercase letters, numbers, hyphen, or underscore only.");
      return;
    }
    if (activity.templates[key]) {
      askConfirm({
        title: "Replace this design?",
        body: `A design with key “${key}” already exists. Uploading will replace its image. People assigned to “${key}” keep that assignment.`,
        confirmLabel: "Replace image",
        danger: true,
        action: async () => {
          await uploadDesignWithKey(key);
        }
      });
      return;
    }
    await uploadDesignWithKey(key);
  }

  function setDefaultDesign(key: string) {
    if (!activity) return;
    saveActivity({ ...activity, defaultTemplateKey: key }, `“${key}” set as default design.`).catch(
      console.error
    );
    setPreviewTemplateKey(key);
    setNewDesignKey(key);
  }

  function startEditDesign(key: string) {
    setEditingDesignKey(key);
    setEditDesignName(key);
    setEditDesignFile(null);
  }

  function cancelEditDesign() {
    setEditingDesignKey(null);
    setEditDesignName("");
    setEditDesignFile(null);
  }

  async function remapParticipantsDesignKey(oldKey: string, nextKey: string) {
    const { db } = getFirebaseServices();
    const snap = await getDocs(collection(db, "activities", slug, "participants"));
    const needingUpdate = snap.docs.filter((d) => d.data().templateKey === oldKey);
    for (let i = 0; i < needingUpdate.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = needingUpdate.slice(i, i + 400);
      for (const d of chunk) {
        batch.update(d.ref, { templateKey: nextKey, updatedAt: serverTimestamp() });
      }
      await batch.commit();
    }
    setParticipants((prev) =>
      prev.map((p) => (p.templateKey === oldKey ? { ...p, templateKey: nextKey } : p))
    );
    if (previewTemplateKey === oldKey) setPreviewTemplateKey(nextKey);
    if (newDesignKey === oldKey) setNewDesignKey(nextKey);
    if (editDesignKey === oldKey) setEditDesignKey(nextKey);
  }

  async function saveEditDesign() {
    if (!activity || !editingDesignKey) return;
    const oldKey = editingDesignKey;
    const nextKey = normalizeDesignKey(editDesignName);
    if (!nextKey || !isValidDesignKey(nextKey)) {
      setError("Design key must be 1–64 characters: lowercase letters, numbers, hyphen, or underscore only.");
      return;
    }
    if (nextKey !== oldKey && activity.templates[nextKey]) {
      setError(`A design key “${nextKey}” already exists.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      let nextUrl = activity.templates[oldKey]?.url || "";
      if (editDesignFile) {
        const upload = await getTemplateUploadUrl({
          activitySlug: slug,
          templateKey: nextKey,
          contentType: "image/png",
          contentLength: editDesignFile.size
        });
        const put = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: upload.headers,
          body: editDesignFile
        });
        if (!put.ok) throw new Error("Upload failed");
        nextUrl = upload.templateUrl;
      }

      const nextTemplates = { ...activity.templates };
      const previous = activity.templates[oldKey];
      if (nextKey !== oldKey) {
        delete nextTemplates[oldKey];
      }
      nextTemplates[nextKey] = {
        url: nextUrl,
        fields: previous?.fields
      };

      const nextDefault =
        activity.defaultTemplateKey === oldKey ? nextKey : activity.defaultTemplateKey || nextKey;

      const nextActivity: Activity = hydrateActivityPlacements({
        ...activity,
        templates: nextTemplates,
        defaultTemplateKey: nextDefault,
        participantFields: stripParticipantFieldsToSchema(
          activity.participantFields
        ) as ParticipantField[]
      });

      const ok = await saveActivity(
        nextActivity,
        nextKey !== oldKey
          ? `Design key renamed to “${nextKey}”.`
          : editDesignFile
            ? `Design “${nextKey}” image updated.`
            : "Design saved.",
        nextKey !== oldKey ? { removeTemplateKeys: [oldKey] } : undefined
      );
      if (!ok) return;

      if (nextKey !== oldKey) {
        await remapParticipantsDesignKey(oldKey, nextKey);
      }
      cancelEditDesign();
    } catch (err) {
      console.error(err);
      setError("Could not update this design. Please try again.");
      setSaving(false);
    }
  }

  function deleteDesign(key: string) {
    if (!activity) return;
    const keys = Object.keys(activity.templates || {});
    if (!keys.includes(key)) return;
    askConfirm({
      title: "Delete this design?",
      body:
        keys.length === 1
          ? `Delete “${key}”? This is the only design on this activity. Placement will need a new upload afterward.`
          : `Delete design key “${key}”? People still assigned to it will fall back to the activity default.`,
      confirmLabel: "Delete design",
      danger: true,
      action: async () => {
        const nextTemplates = { ...activity.templates };
        delete nextTemplates[key];
        const remaining = Object.keys(nextTemplates);
        const nextDefault =
          activity.defaultTemplateKey === key
            ? remaining[0] || ""
            : activity.defaultTemplateKey || "";
        await saveActivity(
          {
            ...activity,
            templates: nextTemplates,
            defaultTemplateKey: nextDefault
          },
          `Design “${key}” deleted.`,
          { removeTemplateKeys: [key] }
        );
        if (previewTemplateKey === key) setPreviewTemplateKey(nextDefault);
        if (newDesignKey === key) setNewDesignKey(nextDefault);
        if (editingDesignKey === key) cancelEditDesign();
      }
    });
  }

  function updateSchemaField(index: number, patch: Partial<ParticipantField>) {
    setActivity((prev) => {
      if (!prev) return prev;
      const old = prev.participantFields[index];
      if (!old) return prev;
      const nextField = toFieldSchema({ ...old, ...patch }) as ParticipantField;
      let templates = prev.templates;
      if (patch.key && patch.key !== old.key) {
        templates = { ...prev.templates };
        for (const [designKey, config] of Object.entries(templates)) {
          if (!config.fields?.[old.key]) continue;
          const fields = { ...config.fields };
          fields[patch.key] = fields[old.key];
          delete fields[old.key];
          templates[designKey] = { ...config, fields };
        }
      }
      const participantFields = prev.participantFields.map((field, i) =>
        i === index ? nextField : (toFieldSchema(field) as ParticipantField)
      );
      return { ...prev, participantFields, templates };
    });
  }

  function updatePlacement(fieldKey: string, patch: Partial<FieldPlacement>) {
    setActivity((prev) => {
      if (!prev) return prev;
      const designKey = resolveDesignKey(prev, previewTemplateKey);
      if (!designKey) return prev;
      return updateDesignFieldPlacement(prev, designKey, fieldKey, patch);
    });
  }

  function removeField(index: number) {
    if (!activity) return;
    const field = activity.participantFields[index];
    if (field?.key === "name") {
      setError("The name field is required and can't be removed.");
      return;
    }
    askConfirm({
      title: "Remove this field?",
      body: `Remove “${field?.label || field?.key || "this field"}” from the activity? People data already collected for this column will no longer show in the form, and it won’t appear on certificates. Save fields afterward to keep the change.`,
      confirmLabel: "Remove field",
      danger: true,
      action: () => {
        setActivity((prev) => {
          if (!prev || !field) return prev;
          const without = {
            ...prev,
            participantFields: prev.participantFields.filter((_, i) => i !== index)
          };
          return removeFieldPlacementFromAllDesigns(without, field.key);
        });
        flashOk("Field removed. Remember to save fields.");
      }
    });
  }

  function addField() {
    if (!activity) return;
    const n = activity.participantFields.length + 1;
    const key = `field_${n}`;
    const withSchema: Activity = {
      ...activity,
      participantFields: [
        ...activity.participantFields.map((f) => toFieldSchema(f) as ParticipantField),
        {
          key,
          label: `Field ${n}`,
          onCertificate: true
        }
      ]
    };
    setActivity(addFieldPlacementToAllDesigns(withSchema, key, activity.participantFields.length));
  }

  async function addParticipant(e: FormEvent) {
    e.preventDefault();
    if (!activity || !newName.trim() || !newLookup.trim()) return;
    const lookupNorm = toLookupKey(newLookup);
    if (existingLookupSet(participants).has(lookupNorm)) {
      setError("That lookup is already used by someone on this activity.");
      return;
    }
    setAddingPerson(true);
    setError("");
    try {
      const { db } = getFirebaseServices();
      const additionalFields: Record<string, string> = {};
      for (const field of customFields) {
        const value = (customFieldValues[field.key] || "").trim();
        if (value) additionalFields[field.key] = value;
      }
      const design = newDesignKey.trim().toLowerCase();
      const payload = {
        name: newName.trim(),
        lookup: lookupNorm,
        certificateStatus: "pending" as const,
        ...(design ? { templateKey: design } : {}),
        additionalFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const refDoc = doc(collection(db, "activities", slug, "participants"));
      const batch = writeBatch(db);
      batch.set(refDoc, payload);
      batch.set(doc(db, "activities", slug, "lookupKeys", toLookupDocId(lookupNorm)), {
        participantId: refDoc.id,
        lookup: lookupNorm,
        createdAt: serverTimestamp()
      });
      await batch.commit();
      setParticipants((prev) =>
        [
          ...prev,
          {
            id: refDoc.id,
            name: payload.name,
            lookup: payload.lookup,
            ...(design ? { templateKey: design } : {}),
            additionalFields,
            certificateStatus: "pending" as const
          }
        ].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setNewName("");
      setNewLookup("");
      setNewDesignKey("");
      setCustomFieldValues({});
      flashOk("Person added.");
    } catch (err) {
      console.error(err);
      setError("Unable to add this person.");
    } finally {
      setAddingPerson(false);
    }
  }

  function startEdit(row: ParticipantRow) {
    setEditingId(row.id);
    setEditName(row.name || "");
    setEditLookup(row.lookup || "");
    setEditDesignKey(row.templateKey || "");
    setEditFields({ ...(row.additionalFields || {}) });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditLookup("");
    setEditDesignKey("");
    setEditFields({});
  }

  async function saveEdit(e?: FormEvent) {
    e?.preventDefault();
    if (!editingId || !editName.trim() || !editLookup.trim()) return;
    const lookupNorm = toLookupKey(editLookup);
    if (existingLookupSet(participants, editingId).has(lookupNorm)) {
      setError("That lookup is already used by someone on this activity.");
      return;
    }
    setAddingPerson(true);
    setError("");
    try {
      const { db } = getFirebaseServices();
      const additionalFields: Record<string, string> = {};
      for (const field of customFields) {
        const value = (editFields[field.key] || "").trim();
        if (value) additionalFields[field.key] = value;
      }
      const design = editDesignKey.trim().toLowerCase();
      const prevLookup = toLookupKey(
        participants.find((p) => p.id === editingId)?.lookup || ""
      );
      const batch = writeBatch(db);
      batch.update(doc(db, "activities", slug, "participants", editingId), {
        name: editName.trim(),
        lookup: lookupNorm,
        templateKey: design ? design : deleteField(),
        additionalFields,
        updatedAt: serverTimestamp()
      });
      if (prevLookup && prevLookup !== lookupNorm) {
        batch.delete(doc(db, "activities", slug, "lookupKeys", toLookupDocId(prevLookup)));
      }
      batch.set(doc(db, "activities", slug, "lookupKeys", toLookupDocId(lookupNorm)), {
        participantId: editingId,
        lookup: lookupNorm,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      setParticipants((prev) =>
        prev
          .map((p) =>
            p.id === editingId
              ? {
                  ...p,
                  name: editName.trim(),
                  lookup: lookupNorm,
                  templateKey: design || undefined,
                  additionalFields
                }
              : p
          )
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      cancelEdit();
      flashOk("Person updated.");
    } catch (err) {
      console.error(err);
      setError("Unable to update this person.");
    } finally {
      setAddingPerson(false);
    }
  }

  async function deleteParticipant(id: string) {
    const row = participants.find((p) => p.id === id);
    askConfirm({
      title: "Remove this person?",
      body: row
        ? `Remove ${row.name || "this person"} (${row.lookup || "no lookup"}) from the people list? This cannot be undone.`
        : "Remove this person from the people list? This cannot be undone.",
      confirmLabel: "Remove person",
      danger: true,
      action: async () => {
        const { db } = getFirebaseServices();
        const batch = writeBatch(db);
        batch.delete(doc(db, "activities", slug, "participants", id));
        if (row?.lookup) {
          batch.delete(doc(db, "activities", slug, "lookupKeys", toLookupDocId(toLookupKey(row.lookup))));
        }
        await batch.commit();
        setParticipants((prev) => prev.filter((p) => p.id !== id));
        if (editingId === id) cancelEdit();
        flashOk("Person removed.");
      }
    });
  }

  async function commitImportReview() {
    if (!importAllOk) return;
    setImporting(true);
    setError("");
    try {
      const payload = validatedImportRows.map((row) => ({
        name: row.name,
        lookup: row.lookup,
        ...(row.templateKey ? { templateKey: row.templateKey } : {}),
        additionalFields: row.additionalFields
      }));
      const totalChunks = Math.max(1, Math.ceil(payload.length / BULK_CHUNK_SIZE));
      let processed = 0;
      let skipped = 0;
      for (let i = 0; i < payload.length; i += BULK_CHUNK_SIZE) {
        const chunkIndex = i / BULK_CHUNK_SIZE;
        if (totalChunks > 1) {
          setImportChunkProgress({ current: chunkIndex + 1, total: totalChunks });
        }
        const chunk = payload.slice(i, i + BULK_CHUNK_SIZE);
        const result = await bulkUploadParticipants({
          activitySlug: slug,
          participants: chunk
        });
        processed += Number(result.processed || chunk.length);
        skipped += Number(result.skipped || 0);
      }
      // Refresh people via HTTPS REST (same path as tab open) — no RTDB WebSocket listener.
      await reloadParticipants().catch(console.error);
      flashOk(
        `Imported ${processed} people.${skipped ? ` ${skipped} already existed and were skipped.` : ""}`
      );
      resetImportSourceUi();
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message || "")
          : "";
      setError(msg || "Import failed. Fix red rows and try again.");
    } finally {
      setImporting(false);
      setImportChunkProgress(null);
    }
  }

  async function onCsvFileSelected(file: File | null) {
    if (!file) return;
    setError("");
    setImporting(true);
    try {
      const text = await file.text();
      const table = parseCsv(text);
      const rows = parseImportCsvTable(table, {
        existingLookups: existingLookupSet(participants),
        designKeys: designKeySet
      });
      if (!rows.length) throw new Error("Your file needs a header row and at least one person");
      enterImportReview(
        rows.map(({ issues: _i, ok: _o, ...draft }) => draft),
        file.name
      );
    } catch (err) {
      console.error(err);
      resetImportSourceUi();
      setError(
        err instanceof Error
          ? err.message
          : "Import failed. Use the CSV sample, or export your sheet as CSV and try again."
      );
    } finally {
      setImporting(false);
    }
  }

  async function loadSheetCsvIntoReview(url: string, gid?: string) {
    const qs = new URLSearchParams({ url });
    if (gid) qs.set("gid", gid);
    const res = await fetch(`/api/sheet-csv?${qs.toString()}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Could not import that Google Sheet.");
    }
    const text = await res.text();
    const table = parseCsv(text);
    const rows = parseImportCsvTable(table, {
      existingLookups: existingLookupSet(participants),
      designKeys: designKeySet
    });
    if (!rows.length) throw new Error("That sheet needs a header row and at least one person");
    enterImportReview(
      rows.map(({ issues: _i, ok: _o, ...draft }) => draft),
      "Google Sheet"
    );
  }

  async function onImportGoogleSheet(e: FormEvent) {
    e.preventDefault();
    const url = sheetUrl.trim();
    if (!url) return;
    setImporting(true);
    setError("");
    try {
      const metaRes = await fetch(`/api/sheet-sheets?url=${encodeURIComponent(url)}`);
      const meta = (await metaRes.json().catch(() => null)) as {
        sheets?: Array<{ name: string; gid: string }>;
        error?: string;
      } | null;
      if (!metaRes.ok) {
        throw new Error(meta?.error || "Could not read that Google Sheet.");
      }
      const sheets = meta?.sheets || [];
      if (sheets.length > 1) {
        setPendingSheetUrl(url);
        setSheetOptions(sheets);
        setSelectedSheetGid(sheets[0]?.gid || "0");
        setImportMode("pickSheet");
        setCsvFileName("");
        setCsvPreviewCount(0);
        return;
      }
      const gid = sheets[0]?.gid;
      await loadSheetCsvIntoReview(url, gid);
      setSheetUrl("");
    } catch (err) {
      console.error(err);
      resetImportSourceUi();
      setError(
        err instanceof Error
          ? err.message
          : "Google Sheet import failed. Share the sheet as “Anyone with the link”, or download CSV instead."
      );
    } finally {
      setImporting(false);
    }
  }

  async function onConfirmSheetPick(e: FormEvent) {
    e.preventDefault();
    if (!pendingSheetUrl || !selectedSheetGid) return;
    setImporting(true);
    setError("");
    try {
      await loadSheetCsvIntoReview(pendingSheetUrl, selectedSheetGid);
      setSheetUrl("");
      setPendingSheetUrl("");
      setSheetOptions([]);
    } catch (err) {
      console.error(err);
      resetImportSourceUi();
      setError(
        err instanceof Error
          ? err.message
          : "Google Sheet import failed. Share the sheet as “Anyone with the link”, or download CSV instead."
      );
    } finally {
      setImporting(false);
    }
  }

  function updateImportDraftRow(id: string, patch: Partial<ImportDraftRow>) {
    setImportDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeImportDraftRow(id: string) {
    setImportDraft((prev) => prev.filter((row) => row.id !== id));
  }

  function exportCsv() {
    if (!activity) return;
    const headers = [
      "Name",
      "Lookup",
      "Design",
      "Certificate Status",
      ...customFields.map((f) => f.label || f.key)
    ];
    const rows = [headers.map(csvEscape).join(",")];
    for (const row of participants) {
      const values = [
        row.name || "",
        row.lookup || "",
        row.templateKey || "",
        row.certificateStatus || "pending",
        ...customFields.map((field) => row.additionalFields?.[field.key] ?? "")
      ];
      rows.push(values.map(csvEscape).join(","));
    }
    downloadCsv(`${slug}-participants.csv`, rows);
  }

  function downloadTemplateCsv() {
    if (!activity) return;
    const headers = ["name", "lookup", "design", ...customFields.map((f) => f.key)];
    const sample = [
      "Ada Lovelace",
      "ada@example.com",
      "",
      ...customFields.map(() => "sample")
    ];
    downloadCsv(`${slug}-import-template.csv`, [headers.join(","), sample.join(",")]);
  }

  async function onInviteManager(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await inviteActivityManager(managerEmail.trim().toLowerCase(), slug);
      setManagerEmail("");
      flashOk(
        "Manager invite created. Ask them to sign in at /admin with that Google account and accept."
      );
    } catch (err) {
      console.error(err);
      setError("Unable to invite this manager.");
    } finally {
      setSaving(false);
    }
  }

  async function onRemoveManager(uid: string) {
    const row = managers.find((m) => m.uid === uid);
    askConfirm({
      title: "Remove this manager?",
      body: `Remove ${row?.email || "this manager"} from this activity?`,
      confirmLabel: "Remove manager",
      danger: true,
      action: async () => {
        await removeActivityManager(uid, slug);
        setManagers((prev) => prev.filter((m) => m.uid !== uid));
        flashOk("Manager removed.");
      }
    });
  }

  function onHandlePointerDown(fieldKey: string, e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingKey(fieldKey);
  }

  function onHandlePointerMove(fieldKey: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (draggingKey !== fieldKey) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    updatePlacement(fieldKey, { x: `${xPct.toFixed(1)}%`, y: `${yPct.toFixed(1)}%` });
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingKey(null);
  }

  // Debounced live preview regeneration while placing fields.
  useEffect(() => {
    if (tab !== "layout" || !activity) return;
    const key = resolveDesignKey(activity, previewTemplateKey);
    const templateUrl = (key && activity.templates[key]?.url) || "";
    const fields = resolveFieldsForDesign(activity, key).filter((f) => f.onCertificate !== false);
    if (!templateUrl || !fields.length) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const sampleAdditional: Record<string, string> = {};
      for (const field of fields) {
        if (!isCustomField(field)) continue;
        sampleAdditional[field.key] = field.label || field.key;
      }
      renderCertificateCanvas({
        templateUrl,
        participant: {
          id: "preview",
          name: previewName,
          lookup: "sample@example.com",
          additionalFields: sampleAdditional
        },
        fields
      })
        .then((canvas) => {
          if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png"));
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activity, previewName, previewTemplateKey, tab]);

  if (loading) return <div className="card admin-panel">Loading activity…</div>;
  if (!activity) return <div className="card admin-panel status-error">{error || "Activity not found."}</div>;

  return (
    <section className={`admin-page stack${pendingTab ? " is-pending" : ""}`}>
      <p className="activity-back">
        <Link href="/admin/activities" prefetch>
          ← Activities
        </Link>
      </p>

      <div className="admin-page-head">
        <div>
          <h1>{activity.title}</h1>
          <p className="meta">
            /{activity.slug} · <span className={`badge badge-${activity.status}`}>{activity.status}</span>
            {` · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}`}
            {` · ${downloadedCount} downloaded (${downloadPercent}%)`}
          </p>
        </div>
        <a className="btn btn-secondary" href={`/${activity.slug}`} target="_blank" rel="noreferrer">
          View public page
        </a>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Activity editor">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`admin-tab${tab === key ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="admin-toast" role="status">
          {message}
        </div>
      ) : null}
      {error ? <p className="status-error">{error}</p> : null}

      {tab === "details" ? (
        <div className="stack">
          <form className="card admin-panel form-grid" onSubmit={onSaveDetails}>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={activity.title}
                onChange={(e) => setActivity({ ...activity, title: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={slugEditing ? "slug" : undefined}>Web address</label>
              {slugEditing ? (
                <>
                  <div className="slug-edit-row">
                    <span className="slug-prefix" aria-hidden="true">
                      /
                    </span>
                    <input
                      id="slug"
                      value={draftSlug}
                      onChange={(e) => setDraftSlug(slugify(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          requestSlugUpdate();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelSlugEdit();
                        }
                      }}
                      autoFocus
                      disabled={slugBusy}
                      aria-describedby="slug-edit-help"
                    />
                  </div>
                  <p id="slug-edit-help" className="meta" style={{ margin: "0.35rem 0 0.65rem" }}>
                    Must be unique. Changing this breaks the old public link for anyone who has it.
                  </p>
                  <div className="row">
                    <button
                      className="btn"
                      type="button"
                      onClick={requestSlugUpdate}
                      disabled={slugBusy || !slugify(draftSlug) || slugify(draftSlug) === slug}
                    >
                      {slugBusy ? "Updating…" : "Update web address"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={cancelSlugEdit}
                      disabled={slugBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="slug-display-row">
                    <a
                      className="slug-display-link"
                      href={`/${slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      /{slug}
                    </a>
                    <button
                      type="button"
                      className="slug-edit-trigger"
                      onClick={beginSlugEdit}
                      aria-label="Edit web address"
                      title="Edit web address"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M13.5 6.5l3 3"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="meta" style={{ margin: "0.35rem 0 0" }}>
                    Public page link · Changing the address breaks existing shared links.
                  </p>
                </>
              )}
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={activity.description}
                onChange={(e) => setActivity({ ...activity, description: e.target.value })}
                required
              />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="date">Date</label>
                <DateField
                  id="date"
                  value={activity.date || ""}
                  onChange={(next) => setActivity({ ...activity, date: next })}
                />
              </div>
              <div className="field">
                <span className="field-label" id="status-label">
                  Status
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="status-label">
                  {(
                    [
                      ["draft", "Draft"],
                      ["active", "Active"],
                      ["closed", "Closed"]
                    ] as Array<[ActivityStatus, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={activity.status === value}
                      className={`segmented-btn${activity.status === value ? " is-active" : ""}`}
                      onClick={() => setActivity({ ...activity, status: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="seo-keywords">SEO keywords (optional)</label>
              <input
                id="seo-keywords"
                value={activity.seo?.keywords || ""}
                onChange={(e) =>
                  setActivity({
                    ...activity,
                    seo: { ...(activity.seo || {}), keywords: e.target.value }
                  })
                }
                placeholder="Rotaract, certificate, South Asia"
              />
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save details"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setTab("templates")}>
                Next: Design →
              </button>
            </div>
          </form>

          {shareOpen ? (
            <div className="card admin-panel stack" role="dialog" aria-label="Share activity">
              <h3 style={{ margin: 0 }}>Activity is live</h3>
              <p className="meta">
                Share this link so people can download certificates.
                {!Object.keys(activity.templates || {}).length
                  ? " Tip: upload a design first for best results."
                  : ""}
                {participants.length === 0
                  ? " Tip: add people before announcing widely."
                  : ""}
              </p>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <code style={{ flex: 1, minWidth: 200 }}>{`https://certify.rsamdio.org/${slug}/`}</code>
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`https://certify.rsamdio.org/${slug}/`);
                    flashOk("Link copied.");
                  }}
                >
                  Copy link
                </button>
                <a
                  className="btn btn-secondary"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Your certificate for ${activity.title} is ready: https://certify.rsamdio.org/${slug}/`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  className="btn btn-secondary"
                  href={`mailto:?subject=${encodeURIComponent(
                    `Certificate — ${activity.title}`
                  )}&body=${encodeURIComponent(
                    `Hi,%0A%0AYour certificate is ready to download:%0Ahttps://certify.rsamdio.org/${slug}/%0A%0AUse the email or code shared by organizers.`
                  )}`}
                >
                  Email
                </a>
                <button className="btn btn-secondary" type="button" onClick={() => setShareOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          ) : null}

          {canDelete ? (
            <div className="card admin-panel stack">
              <div>
                <h3 style={{ margin: 0 }}>Danger zone</h3>
                <p className="meta">
                  Permanently delete this activity along with its people list and managers. This cannot be undone.
                </p>
              </div>
              <div className="row">
                <button className="btn btn-secondary" type="button" onClick={onDeleteActivity} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete activity"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "participants" ? (
        <div className="stack">
          <details className="card admin-panel admin-collapse" open>
            <summary>
              <div>
                <h3>Certificate fields</h3>
                <p className="meta">
                  Collect any columns you need for records. Only fields marked &ldquo;On certificate&rdquo; are placed on
                  the design.
                </p>
              </div>
            </summary>
            <div className="admin-collapse-body stack">
              {activity.participantFields.map((field, index) => (
                <div
                  key={`${field.key}-${index}`}
                  className="form-grid two"
                  style={{
                    borderTop: index ? "1px solid var(--line)" : undefined,
                    paddingTop: index ? "0.85rem" : 0
                  }}
                >
                  <div className="field">
                    <label>Column name</label>
                    <input
                      value={field.key}
                      onChange={(e) =>
                        updateSchemaField(index, {
                          key: e.target.value
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9_]+/g, "_")
                        })
                      }
                      disabled={field.key === "name"}
                    />
                  </div>
                  <div className="field">
                    <label>Display label</label>
                    <input value={field.label} onChange={(e) => updateSchemaField(index, { label: e.target.value })} />
                  </div>
                  <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "space-between" }}>
                    <label className="toggle-check">
                      <input
                        type="checkbox"
                        checked={field.onCertificate !== false}
                        disabled={field.key === "name"}
                        onChange={(e) => updateSchemaField(index, { onCertificate: e.target.checked })}
                      />
                      <span>On certificate</span>
                    </label>
                    {field.key !== "name" ? (
                      <button className="btn btn-secondary btn-compact" type="button" onClick={() => removeField(index)}>
                        Remove field
                      </button>
                    ) : (
                      <span className="meta">Always on certificate</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="row">
                <button className="btn btn-secondary" type="button" onClick={addField}>
                  Add field
                </button>
                <button className="btn" type="button" onClick={onSaveFields} disabled={saving}>
                  {saving ? "Saving…" : "Save fields"}
                </button>
              </div>
            </div>
          </details>

          <details className="card admin-panel admin-collapse" open={importMode !== "source"}>
            <summary>
              <div>
                <h3>Import people</h3>
                <p className="meta">
                  {importMode === "review"
                    ? "Review rows before importing. Fix or remove any red rows."
                    : importMode === "pickSheet"
                      ? "Choose which sheet tab to import."
                      : "Upload a CSV file, or paste a public Google Sheet link."}
                </p>
              </div>
            </summary>
            <div className="admin-collapse-body stack">
              {importMode === "source" ? (
                <div className="import-split">
                  <div className="stack">
                    <strong className="import-label">CSV file</strong>
                    <label className="csv-drop">
                      <input
                        ref={csvFileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => onCsvFileSelected(e.target.files?.[0] || null)}
                        disabled={importing}
                      />
                      <strong>{importing ? "Reading…" : "Upload CSV"}</strong>
                      <span>
                        {csvFileName
                          ? `${csvFileName}${csvPreviewCount ? ` · ${csvPreviewCount} rows` : ""}`
                          : "Choose a .csv file"}
                      </span>
                    </label>
                    <p className="meta" style={{ margin: 0 }}>
                      <code>lookup</code> is what people enter to search for their certificate,{" "}
                      <code>design</code> is the design key (leave blank to use the activity default).
                    </p>
                    <div className="row">
                      <button className="btn btn-secondary" type="button" onClick={downloadTemplateCsv}>
                        Download CSV sample
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={exportCsv}>
                        Export current list
                      </button>
                    </div>
                  </div>
                  <div className="stack">
                    <strong className="import-label">Google Sheet</strong>
                    <form className="stack" onSubmit={onImportGoogleSheet}>
                      <div className="field">
                        <label htmlFor="sheetUrl">Public sheet link</label>
                        <input
                          id="sheetUrl"
                          type="url"
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/…"
                          disabled={importing}
                        />
                      </div>
                      <p className="meta" style={{ margin: 0 }}>
                        Share the sheet as &ldquo;Anyone with the link&rdquo;. Required headers:{" "}
                        <code>name</code> and <code>lookup</code>. Optional <code>design</code> column
                        (blank = activity default).
                      </p>
                      <button className="btn" type="submit" disabled={importing || !sheetUrl.trim()}>
                        {importing ? "Loading…" : "Continue with Google Sheet"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}

              {importMode === "pickSheet" ? (
                <form className="stack" onSubmit={onConfirmSheetPick}>
                  <p className="meta" style={{ margin: 0 }}>
                    This spreadsheet has multiple tabs. Pick one to import.
                  </p>
                  <div className="import-sheet-radios" role="radiogroup" aria-label="Sheet tabs">
                    {sheetOptions.map((sheet) => (
                      <label key={sheet.gid} className="import-sheet-radio">
                        <input
                          type="radio"
                          name="sheetGid"
                          value={sheet.gid}
                          checked={selectedSheetGid === sheet.gid}
                          onChange={() => setSelectedSheetGid(sheet.gid)}
                          disabled={importing}
                        />
                        <span>{sheet.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="row">
                    <button className="btn" type="submit" disabled={importing || !selectedSheetGid}>
                      {importing ? "Loading…" : "Continue"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={importing}
                      onClick={() => resetImportSourceUi()}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {importMode === "review" ? (
                <div className="stack">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <p className="meta" style={{ margin: 0 }}>
                      {csvFileName || "Import"} · {validatedImportRows.length} rows ·{" "}
                      {validatedImportRows.filter((r) => r.ok).length} ready ·{" "}
                      {validatedImportRows.filter((r) => !r.ok).length} need fixes. Editing
                      re-checks instantly; Import now needs every row OK.
                      {importChunkProgress
                        ? ` Uploading batch ${importChunkProgress.current} of ${importChunkProgress.total}…`
                        : ""}
                    </p>
                    <div className="row">
                      <button
                        className="btn"
                        type="button"
                        disabled={importing || !importAllOk}
                        onClick={() => commitImportReview().catch(console.error)}
                      >
                        {importing
                          ? importChunkProgress
                            ? `Importing ${importChunkProgress.current}/${importChunkProgress.total}…`
                            : "Importing…"
                          : "Import now"}
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={importing}
                        onClick={() => resetImportSourceUi()}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table admin-compact-table import-review-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Name</th>
                          <th>Lookup</th>
                          <th>Design</th>
                          <th className="admin-row-actions-head">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validatedImportRows.map((row) => (
                          <tr
                            key={row.id}
                            className={row.ok ? "import-row-ok" : "import-row-fail"}
                          >
                            <td>
                              {row.ok ? (
                                <span className="badge badge-active">OK</span>
                              ) : (
                                <span className="badge badge-draft" title={row.issues.map((i) => i.message).join(" ")}>
                                  Fix
                                </span>
                              )}
                              {!row.ok ? (
                                <ul className="import-row-issues">
                                  {row.issues.map((issue) => (
                                    <li key={issue.code + issue.message}>{issue.message}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td>
                              <input
                                className={`import-review-input${
                                  row.issues.some((i) => i.code === "missing_name")
                                    ? " is-invalid"
                                    : ""
                                }`}
                                value={row.name}
                                onChange={(e) => updateImportDraftRow(row.id, { name: e.target.value })}
                                aria-label="Name"
                                aria-invalid={row.issues.some((i) => i.code === "missing_name")}
                              />
                            </td>
                            <td>
                              <input
                                className={`import-review-input${
                                  row.issues.some((i) => i.code === "missing_lookup" || i.code === "duplicate_lookup")
                                    ? " is-invalid"
                                    : ""
                                }`}
                                value={row.lookup}
                                onChange={(e) => updateImportDraftRow(row.id, { lookup: e.target.value })}
                                aria-label="Lookup"
                                aria-invalid={row.issues.some(
                                  (i) => i.code === "missing_lookup" || i.code === "duplicate_lookup"
                                )}
                              />
                            </td>
                            <td>
                              {designKeys.length ? (
                                <AdminSelect
                                  compact
                                  aria-label="Design"
                                  value={row.templateKey}
                                  options={personDesignOptions}
                                  onChange={(value) =>
                                    updateImportDraftRow(row.id, { templateKey: value })
                                  }
                                />
                              ) : (
                                <span className="meta">Default</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="link-danger"
                                type="button"
                                onClick={() => removeImportDraftRow(row.id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </details>

          <details className="card admin-panel admin-collapse" open>
            <summary>
              <div>
                <h3>Add person</h3>
                <p className="meta">Add someone manually, one at a time.</p>
              </div>
            </summary>
            <form className="admin-collapse-body form-grid two" onSubmit={addParticipant}>
              <div className="field">
                <label htmlFor="newName">Name</label>
                <input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="newLookup">Lookup</label>
                <input
                  id="newLookup"
                  value={newLookup}
                  onChange={(e) => setNewLookup(e.target.value)}
                  placeholder="Email, code, or any shared identifier"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="newDesign">Design</label>
                {designKeys.length ? (
                  <AdminSelect
                    id="newDesign"
                    value={newDesignKey}
                    options={personDesignOptions}
                    onChange={setNewDesignKey}
                  />
                ) : (
                  <p className="meta" style={{ margin: 0 }}>
                    Upload a design first — this person will use the activity default once designs exist.
                  </p>
                )}
              </div>
              {customFields.map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={`newField-${field.key}`}>{field.label || field.key}</label>
                  <input
                    id={`newField-${field.key}`}
                    value={customFieldValues[field.key] || ""}
                    onChange={(e) =>
                      setCustomFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="row" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit" disabled={addingPerson}>
                  {addingPerson ? "Adding…" : "Add person"}
                </button>
              </div>
            </form>
          </details>

          <div className="card admin-panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>People ({participants.length})</h3>
              <button className="btn btn-secondary" type="button" onClick={() => setTab("managers")}>
                Next: Managers →
              </button>
            </div>
            <input
              className="admin-search"
              value={participantQuery}
              onChange={(e) => {
                setParticipantQuery(e.target.value);
                setPeoplePage(0);
              }}
              placeholder="Search people…"
              aria-label="Search people"
            />
            <div className="table-wrap">
              <table className="data-table admin-compact-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Lookup</th>
                    <th>Design</th>
                    {customFields.map((field) => (
                      <th key={field.key}>{field.label || field.key}</th>
                    ))}
                    <th>Status</th>
                    <th className="admin-row-actions-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedParticipants.map((row) => {
                    const isEditing = editingId === row.id;
                    if (isEditing) {
                      return (
                        <tr key={row.id} className="people-row-editing">
                          <td>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              aria-label="Name"
                              required
                            />
                          </td>
                          <td>
                            <input
                              value={editLookup}
                              onChange={(e) => setEditLookup(e.target.value)}
                              aria-label="Lookup"
                              placeholder="Email, code, or identifier"
                              required
                            />
                          </td>
                          <td>
                            {designKeys.length ? (
                              <AdminSelect
                                compact
                                aria-label="Design"
                                value={editDesignKey}
                                options={personDesignOptions}
                                onChange={setEditDesignKey}
                              />
                            ) : (
                              <span className="meta">{editDesignKey || "Default"}</span>
                            )}
                          </td>
                          {customFields.map((field) => (
                            <td key={field.key}>
                              <input
                                value={editFields[field.key] || ""}
                                onChange={(e) =>
                                  setEditFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                                }
                                aria-label={field.label || field.key}
                              />
                            </td>
                          ))}
                          <td>
                            <span
                              className={`badge ${
                                row.certificateStatus === "downloaded" ? "badge-active" : "badge-draft"
                              }`}
                            >
                              {row.certificateStatus || "pending"}
                            </span>
                          </td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                className="link-action"
                                type="button"
                                disabled={addingPerson}
                                onClick={() => {
                                  saveEdit().catch(console.error);
                                }}
                              >
                                {addingPerson ? "Saving…" : "Save"}
                              </button>
                              <button className="link-danger" type="button" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.lookup}</td>
                        <td>
                          {displayDesignLabel(row)}
                        </td>
                        {customFields.map((field) => (
                          <td key={field.key}>{row.additionalFields?.[field.key] || "—"}</td>
                        ))}
                        <td>
                          <span
                            className={`badge ${
                              row.certificateStatus === "downloaded" ? "badge-active" : "badge-draft"
                            }`}
                          >
                            {row.certificateStatus || "pending"}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="link-action" type="button" onClick={() => startEdit(row)}>
                              Edit
                            </button>
                            <button
                              className="link-danger"
                              type="button"
                              onClick={() => deleteParticipant(row.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredParticipants.length === 0 ? (
                <div className="empty-state">
                  <h3>No people yet</h3>
                  <p>Upload a CSV, import a Google Sheet, or add someone manually.</p>
                </div>
              ) : null}
            </div>
            {filteredParticipants.length > PEOPLE_PAGE_SIZE ? (
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <p className="meta" style={{ margin: 0 }}>
                  Showing {peoplePage * PEOPLE_PAGE_SIZE + 1}–
                  {Math.min((peoplePage + 1) * PEOPLE_PAGE_SIZE, filteredParticipants.length)} of{" "}
                  {filteredParticipants.length}
                </p>
                <div className="row">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={peoplePage <= 0}
                    onClick={() => setPeoplePage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={peoplePage >= peoplePageCount - 1}
                    onClick={() => setPeoplePage((p) => Math.min(peoplePageCount - 1, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "templates" ? (
        <div className="stack">
          <form className="card admin-panel form-grid" onSubmit={onUploadTemplate}>
            <p className="meta" style={{ marginTop: 0 }}>
              Upload certificate designs (e.g. gold, silver, bronze). Each needs a unique design key —
              used when assigning designs to people. Field positions are shared; preview each artwork on
              Placement.
            </p>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="designName">Design key</label>
                <input
                  id="designName"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  placeholder="gold / silver / bronze"
                  required
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(designKeyInputError(designName))}
                />
                {designKeyInputError(designName) ? (
                  <p className="status-error" style={{ margin: "0.35rem 0 0" }}>
                    {designKeyInputError(designName)}
                  </p>
                ) : null}
              </div>
              <div className="field">
                <label>Certificate image (PNG, max 5MB)</label>
                <div className="row">
                  <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                    Choose file
                    <input
                      type="file"
                      accept="image/png"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      hidden
                      required
                    />
                  </label>
                  <span className="meta">{uploadFile?.name || "No file chosen"}</span>
                </div>
              </div>
            </div>
            <div className="row">
              <button
                className="btn"
                type="submit"
                disabled={saving || !uploadFile || Boolean(designKeyInputError(designName))}
              >
                {saving ? "Uploading…" : "Upload design"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setTab("layout")}>
                Next: Placement →
              </button>
            </div>
          </form>

          <div className="card admin-panel stack">
            <h3 style={{ margin: 0 }}>Uploaded designs</h3>
            {Object.keys(activity.templates).length === 0 ? (
              <p className="meta">No designs uploaded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Design key</th>
                      <th>Preview</th>
                      <th>Default</th>
                      <th className="admin-row-actions-head">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(activity.templates).map(([key, value]) => {
                      const isEditing = editingDesignKey === key;
                      if (isEditing) {
                        return (
                          <tr key={key} className="people-row-editing">
                            <td>
                              <div className="stack" style={{ gap: "0.25rem" }}>
                                <input
                                  value={editDesignName}
                                  onChange={(e) => setEditDesignName(e.target.value)}
                                  aria-label="Design key"
                                  placeholder="gold / silver / bronze"
                                  required
                                  spellCheck={false}
                                  autoComplete="off"
                                  aria-invalid={Boolean(designKeyInputError(editDesignName))}
                                />
                                {designKeyInputError(editDesignName) ? (
                                  <p className="status-error" style={{ margin: 0, fontSize: "0.82rem" }}>
                                    {designKeyInputError(editDesignName)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <div className="stack" style={{ gap: "0.35rem" }}>
                                <a href={value.url} target="_blank" rel="noreferrer">
                                  View image
                                </a>
                                <label className="link-action" style={{ cursor: "pointer" }}>
                                  {editDesignFile ? editDesignFile.name : "Replace image…"}
                                  <input
                                    type="file"
                                    accept="image/png"
                                    hidden
                                    onChange={(e) => setEditDesignFile(e.target.files?.[0] || null)}
                                  />
                                </label>
                              </div>
                            </td>
                            <td>
                              {activity.defaultTemplateKey === key ? (
                                <span className="badge badge-active">Default</span>
                              ) : (
                                <span className="meta">—</span>
                              )}
                            </td>
                            <td>
                              <div className="admin-row-actions">
                                <button
                                  className="link-action"
                                  type="button"
                                  disabled={saving || Boolean(designKeyInputError(editDesignName))}
                                  onClick={() => {
                                    saveEditDesign().catch(console.error);
                                  }}
                                >
                                  {saving ? "Saving…" : "Save"}
                                </button>
                                <button
                                  className="link-danger"
                                  type="button"
                                  onClick={cancelEditDesign}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>
                            <a href={value.url} target="_blank" rel="noreferrer">
                              View image
                            </a>
                          </td>
                          <td>
                            {activity.defaultTemplateKey === key ? (
                              <span className="badge badge-active">Default</span>
                            ) : (
                              <button
                                className="link-action"
                                type="button"
                                onClick={() => setDefaultDesign(key)}
                                disabled={saving}
                              >
                                Set default
                              </button>
                            )}
                          </td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                className="link-action"
                                type="button"
                                onClick={() => startEditDesign(key)}
                                disabled={saving || Boolean(editingDesignKey)}
                              >
                                Edit
                              </button>
                              <button
                                className="link-danger"
                                type="button"
                                onClick={() => deleteDesign(key)}
                                disabled={saving}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "layout" ? (
        <>
          <CertificateFontsLink />
          {placementMobileGate ? (
            <div className="card admin-panel stack">
              <h3 style={{ marginTop: 0 }}>Place fields on a larger screen</h3>
              <p className="meta">
                Drag-to-position works best on tablet or desktop. You can still review designs on this
                device, then finish placement on a larger screen.
              </p>
              <button className="btn" type="button" onClick={() => setPlacementMobileGate(false)}>
                Continue anyway
              </button>
            </div>
          ) : null}
          {!canPlaceFields ? (
            <div className="stack">
              {!placementFields.length ? (
                <div className="card admin-panel">
                  <h3 style={{ marginTop: 0 }}>Turn on a certificate field first</h3>
                  <p className="meta">
                    Placement needs at least one field with &ldquo;On certificate&rdquo; turned on. Set this up
                    under People.
                  </p>
                  <button className="btn" type="button" onClick={() => setTab("participants")}>
                    Go to People
                  </button>
                </div>
              ) : null}
              {!hasTemplate ? (
                <div className="card admin-panel">
                  <h3 style={{ marginTop: 0 }}>Upload a design first</h3>
                  <p className="meta">
                    You&rsquo;ll place names and other details on top of your certificate design.
                  </p>
                  <button className="btn" type="button" onClick={() => setTab("templates")}>
                    Go to Design
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="placement-split">
              <div className="placement-controls">
                {placementFields.map(({ field }, panelIndex) => (
                  <PlacementFieldPanel
                    key={field.key}
                    title={field.label || field.key}
                    meta={`${String(field.x)} · ${String(field.y)} · ${field.font_size}px${
                      field.font_family ? ` · ${field.font_family}` : ""
                    }${field.bold ? " · bold" : ""}${field.italic ? " · italic" : ""}`}
                    defaultOpen={panelIndex === 0}
                  >
                    <div className="field">
                      <label>X position</label>
                      <input
                        value={String(field.x ?? "50%")}
                        placeholder="50%"
                        onChange={(e) => updatePlacement(field.key, { x: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Y position</label>
                      <input
                        value={String(field.y ?? "48%")}
                        placeholder="48%"
                        onChange={(e) => updatePlacement(field.key, { y: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Font size</label>
                      <input
                        type="number"
                        min={8}
                        max={120}
                        value={field.font_size ?? 24}
                        onChange={(e) =>
                          updatePlacement(field.key, { font_size: Number(e.target.value) || 16 })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Width</label>
                      <input
                        value={String(field.width ?? "70%")}
                        placeholder="70%"
                        onChange={(e) => updatePlacement(field.key, { width: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor={`font-${field.key}`}>Font</label>
                      <AdminSelect
                        id={`font-${field.key}`}
                        value={field.font_family || "Georgia"}
                        options={[
                          ...CERTIFICATE_FONTS.map((font) => ({
                            value: font,
                            label: font,
                            style: { fontFamily: font }
                          })),
                          ...(field.font_family &&
                          !CERTIFICATE_FONTS.includes(
                            field.font_family as (typeof CERTIFICATE_FONTS)[number]
                          )
                            ? [
                                {
                                  value: field.font_family,
                                  label: field.font_family,
                                  style: { fontFamily: field.font_family }
                                }
                              ]
                            : [])
                        ]}
                        onChange={(next) => updatePlacement(field.key, { font_family: next })}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="field-label">Alignment</span>
                      <div
                        className="segmented"
                        role="radiogroup"
                        aria-label={`${field.label || field.key} alignment`}
                      >
                        {(
                          [
                            ["left", "Left"],
                            ["center", "Center"],
                            ["right", "Right"]
                          ] as Array<[NonNullable<ParticipantField["text_align"]>, string]>
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={(field.text_align || "center") === value}
                            className={`segmented-btn${
                              (field.text_align || "center") === value ? " is-active" : ""
                            }`}
                            onClick={() => updatePlacement(field.key, { text_align: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="field-label">Style</span>
                      <div className="segmented" role="group" aria-label={`${field.label || field.key} style`}>
                        <button
                          type="button"
                          className={`segmented-btn${field.bold ? " is-active" : ""}`}
                          aria-pressed={Boolean(field.bold)}
                          onClick={() => updatePlacement(field.key, { bold: !field.bold })}
                        >
                          Bold
                        </button>
                        <button
                          type="button"
                          className={`segmented-btn${field.italic ? " is-active" : ""}`}
                          aria-pressed={Boolean(field.italic)}
                          onClick={() => updatePlacement(field.key, { italic: !field.italic })}
                        >
                          Italic
                        </button>
                      </div>
                    </div>
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="field-label">Color</span>
                      <div className="color-field">
                        <label className="color-swatch" title="Pick color">
                          <input
                            type="color"
                            value={normalizeHexColor(field.color || "#1c1216")}
                            onChange={(e) => updatePlacement(field.key, { color: e.target.value })}
                            aria-label="Color swatch"
                          />
                        </label>
                        <input
                          className="color-hex"
                          value={field.color || "#1c1216"}
                          onChange={(e) => {
                            const next = e.target.value;
                            updatePlacement(field.key, {
                              color: next.startsWith("#") ? next : `#${next}`
                            });
                          }}
                          onBlur={(e) =>
                            updatePlacement(field.key, { color: normalizeHexColor(e.target.value) })
                          }
                          placeholder="#1c1216"
                          spellCheck={false}
                          aria-label="Color hex code"
                        />
                      </div>
                    </div>
                  </PlacementFieldPanel>
                ))}
                <div className="row">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const next = hydrateActivityPlacements({
                        ...activity,
                        participantFields: stripParticipantFieldsToSchema(
                          activity.participantFields
                        ) as ParticipantField[]
                      });
                      saveActivity(next, "Placement saved.").catch(console.error);
                    }}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save placement"}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => setTab("participants")}>
                    Next: People →
                  </button>
                </div>
              </div>

              <div className="placement-preview">
                <div className="form-grid two" style={{ width: "100%", maxWidth: 420 }}>
                  <div className="field">
                    <label htmlFor="previewTemplate">Editing design</label>
                    <AdminSelect
                      id="previewTemplate"
                      value={activeDesignKey || designKeys[0] || ""}
                      options={designOptions}
                      onChange={setPreviewTemplateKey}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="previewName">Sample name</label>
                    <input
                      id="previewName"
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                    />
                  </div>
                </div>
                <p className="meta" style={{ margin: 0, width: "100%", maxWidth: 420 }}>
                  Placement is per design. Switch the design above to edit that artwork&rsquo;s positions,
                  fonts, and colors.
                </p>
                <div className="placement-stage" ref={stageRef}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="Certificate preview" />
                  ) : (
                    <p className="meta" style={{ padding: "2.5rem 1rem", margin: 0, textAlign: "center" }}>
                      Generating preview…
                    </p>
                  )}
                  {placementFields.map(({ field }) => (
                    <div
                      key={field.key}
                      className="placement-handle"
                      style={{
                        left: toPercent(field.x ?? "50%"),
                        top: toPercent(field.y ?? "50%")
                      }}
                      onPointerDown={(e) => onHandlePointerDown(field.key, e)}
                      onPointerMove={(e) => onHandlePointerMove(field.key, e)}
                      onPointerUp={onHandlePointerUp}
                      title={field.label || field.key}
                    />
                  ))}
                </div>
                <p className="meta">Drag a marker to reposition that field on this design.</p>
              </div>
            </div>
          )}
        </>
      ) : null}

      {tab === "managers" ? (
        <div className="stack">
          <div className="card admin-panel stack">
            <div>
              <h3 style={{ margin: 0 }}>Activity managers</h3>
              <p className="meta" style={{ margin: "0.35rem 0 0" }}>
                Managers can help with this activity only. Platform-wide admins are invited from Team — not
                here. No email is sent; they sign in with the invited Google account and accept.
              </p>
            </div>
            <form className="invite-inline" onSubmit={onInviteManager}>
              <div className="field" style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="managerEmail">Google email</label>
                <input
                  id="managerEmail"
                  type="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
              <button className="btn" type="submit" disabled={saving}>
                Create invite
              </button>
            </form>
          </div>
          <div className="card admin-panel">
            <h3 style={{ marginTop: 0 }}>Current managers</h3>
            {managers.length === 0 ? (
              <p className="meta">No managers assigned yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((manager) => (
                      <tr key={manager.uid}>
                        <td>{manager.email || manager.uid}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-compact"
                            type="button"
                            onClick={() => onRemoveManager(manager.uid)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        body={confirmState?.body || ""}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
        onConfirm={() => {
          runConfirm().catch(console.error);
        }}
      />
    </section>
  );
}

function PlacementFieldPanel({
  title,
  meta,
  defaultOpen = false,
  children
}: {
  title: string;
  meta: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="card admin-panel admin-collapse"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <div>
          <h3>{title}</h3>
          <p className="meta">{meta}</p>
        </div>
      </summary>
      <div className="admin-collapse-body form-grid two">{children}</div>
    </details>
  );
}
