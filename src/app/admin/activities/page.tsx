"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteDoc, doc, collection, getDocs, writeBatch } from "firebase/firestore";
import { get, ref } from "firebase/database";
import { getFirebaseServices } from "@/lib/firebase-client";
import { syncAdminClaims } from "@/lib/callables";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type CatalogRow = {
  slug: string;
  title: string;
  description?: string;
  date?: string;
  status: "active" | "closed" | "draft";
  participantsCount?: number;
  certificatesCount?: number;
};

type StatusFilter = "all" | "active" | "draft" | "closed";

export default function AdminActivitiesPage() {
  return <ActivitiesList />;
}

async function deleteActivityDeep(slug: string) {
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
  await deleteDoc(doc(db, "activities", slug));
}

function ActivitiesList() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<{ slug: string; title: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      await syncAdminClaims().catch(() => undefined);
      const { auth, rtdb } = getFirebaseServices();
      const token = await auth.currentUser?.getIdTokenResult(true);
      const role = String(token?.claims.role || "");
      const managed = (token?.claims.managed_activities || {}) as Record<string, boolean>;
      setCanCreate(role === "super" || role === "platform");
      setCanDelete(role === "super" || role === "platform");

      let list: CatalogRow[] = [];
      if (role === "super" || role === "platform") {
        const snap = await get(ref(rtdb, "activities/catalog"));
        const value = (snap.val() as Record<string, CatalogRow> | null) ?? {};
        list = Object.values(value);
      } else {
        const slugs = Object.keys(managed).filter((slug) => managed[slug]);
        const fetched = await Promise.all(
          slugs.map(async (slug) => {
            const snap = await get(ref(rtdb, `activities/catalog/${slug}`));
            return snap.val() as CatalogRow | null;
          })
        );
        list = fetched.filter(Boolean) as CatalogRow[];
      }

      list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setRows(list);
    } catch (err) {
      console.error(err);
      setError("Unable to load activities. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        String(row.description || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [rows, filter, query]);

  async function onDelete(slug: string, title: string) {
    if (!canDelete) return;
    setConfirmDelete({ slug, title });
  }

  async function runDelete() {
    if (!confirmDelete) return;
    const { slug } = confirmDelete;
    setDeleting(slug);
    setError("");
    try {
      await deleteActivityDeep(slug);
      setRows((prev) => prev.filter((r) => r.slug !== slug));
      setConfirmDelete(null);
    } catch (err) {
      console.error(err);
      setError("Could not delete that activity. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className={`admin-page stack${pending ? " is-pending" : ""}`}>
      <div className="admin-page-head compact">
        <div>
          <h1>Activities</h1>
          <p>Programs ready for certificates.</p>
        </div>
        {canCreate ? (
          <Link className="btn" href="/admin/activities/new" prefetch>
            Create activity
          </Link>
        ) : null}
      </div>

      <div className="admin-toolbar compact">
        <div className="admin-filter-chips" role="group" aria-label="Filter by status">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["draft", "Drafts"],
              ["closed", "Closed"]
            ] as Array<[StatusFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`admin-chip${filter === key ? " is-active" : ""}`}
              onClick={() => startTransition(() => setFilter(key))}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="admin-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search activities"
        />
      </div>

      {loading ? <div className="card admin-panel compact">Loading…</div> : null}
      {error ? <div className="card admin-panel status-error">{error}</div> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="card empty-state compact">
          <h3>No activities yet</h3>
          <p>
            {canCreate
              ? "Create an activity, add people, then upload your certificate design."
              : "No activities have been shared with your account yet."}
          </p>
        </div>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="card admin-panel compact table-wrap">
          <table className="data-table admin-compact-table admin-activities-table">
            <colgroup>
              <col className="col-activity" />
              <col className="col-status" />
              <col className="col-date" />
              <col className="col-people" />
              <col className="col-downloaded" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Status</th>
                <th>Date</th>
                <th>People</th>
                <th>Downloaded</th>
                <th className="admin-row-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const people =
                  typeof row.participantsCount === "number" ? Math.max(0, row.participantsCount) : null;
                const downloaded =
                  typeof row.certificatesCount === "number" ? Math.max(0, row.certificatesCount) : null;
                const percent =
                  people !== null && downloaded !== null && people > 0
                    ? Math.round((downloaded / people) * 100)
                    : people === 0
                      ? 0
                      : null;
                return (
                <tr key={row.slug}>
                  <td>
                    <Link
                      className="admin-row-title"
                      href={`/admin/activities/${row.slug}?tab=details`}
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge badge-${row.status}`}>{row.status}</span>
                  </td>
                  <td>{row.date || "—"}</td>
                  <td>{people !== null ? people : "—"}</td>
                  <td>
                    {downloaded !== null && percent !== null
                      ? `${downloaded} (${percent}%)`
                      : downloaded !== null
                        ? String(downloaded)
                        : "—"}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <Link href={`/admin/activities/${row.slug}?tab=details`} prefetch>
                        Manage
                      </Link>
                      {canDelete ? (
                        <button
                          type="button"
                          className="link-danger"
                          disabled={deleting === row.slug}
                          onClick={() => onDelete(row.slug, row.title)}
                        >
                          {deleting === row.slug ? "Deleting…" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this activity?"
        body={
          confirmDelete
            ? `Permanently delete “${confirmDelete.title}” along with its people list and managers. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete activity"
        danger
        busy={Boolean(deleting)}
        onCancel={() => {
          if (!deleting) setConfirmDelete(null);
        }}
        onConfirm={() => {
          runDelete().catch(console.error);
        }}
      />
    </section>
  );
}
