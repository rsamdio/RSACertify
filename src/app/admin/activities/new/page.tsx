"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createActivityDefaults, slugify } from "@/lib/activity-defaults";
import { getFirebaseServices } from "@/lib/firebase-client";
import { DateField } from "@/components/admin/DateField";
import { DescriptionEditor } from "@/components/admin/DescriptionEditor";
import {
  isDescriptionEmpty,
  sanitizeDescriptionHtml
} from "@/lib/rich-text";

export default function NewActivityPage() {
  return <NewActivityForm />;
}

function NewActivityForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      const { auth } = getFirebaseServices();
      const token = await auth.currentUser?.getIdTokenResult(true);
      const role = String(token?.claims.role || "");
      if (role !== "super" && role !== "platform") {
        router.replace("/admin/activities");
        return;
      }
      setAllowed(true);
    })().catch(() => router.replace("/admin/activities"));
  }, [router]);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugManual) setSlug(slugify(value));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const normalized = slugify(slug);
      if (!normalized) {
        setError("Slug is required.");
        return;
      }
      if (isDescriptionEmpty(description)) {
        setError("Description is required.");
        return;
      }
      const { db } = getFirebaseServices();
      const ref = doc(db, "activities", normalized);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        setError("An activity with this slug already exists. Choose a different web address.");
        return;
      }
      const payload = createActivityDefaults({
        slug: normalized,
        title: title.trim(),
        description: sanitizeDescriptionHtml(description),
        date: date || undefined
      });
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      router.push(`/admin/activities/${normalized}?tab=templates`);
    } catch (err) {
      console.error(err);
      setError("Could not create activity. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return <section className="admin-page stack">Checking access…</section>;
  }

  return (
    <section className="admin-page stack">
      <p className="activity-back">
        <Link href="/admin/activities" prefetch>
          ← Activities
        </Link>
      </p>
      <div className="admin-page-head">
        <div>
          <h1>New activity</h1>
          <p className="meta">Create the details, then upload a certificate design.</p>
        </div>
      </div>
      <div className="card admin-panel">
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="slug">Web address (slug)</label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              required
            />
            <p className="meta" style={{ margin: "0.35rem 0 0" }}>
              Public page: <code>/{slugify(slug) || "…"}</code> · Must be unique.
            </p>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="description">Description</label>
            <DescriptionEditor
              id="description"
              value={description}
              onChange={setDescription}
            />
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <DateField id="date" value={date} onChange={setDate} />
          </div>
          {error ? <p className="status-error">{error}</p> : null}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create & upload design"}
          </button>
        </form>
      </div>
    </section>
  );
}
