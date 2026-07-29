"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createActivityDefaults, slugify } from "@/lib/activity-defaults";
import { getFirebaseServices } from "@/lib/firebase-client";
import { DateField } from "@/components/admin/DateField";

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
        description: description.trim(),
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
      setError("Unable to create activity. Check permissions and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page" style={{ maxWidth: 720 }}>
      <p className="activity-back">
        <Link href="/admin/activities">← Activities</Link>
      </p>
      <div className="card admin-panel stack">
        <div>
          <h1 style={{ margin: 0 }}>Create activity</h1>
          <p className="meta">
            Starts as a draft. Next you&rsquo;ll upload certificate designs, add people (and assign a design
            per person if needed), then place text on the artwork.
          </p>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" value={title} onChange={(e) => onTitleChange(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="slug">Web address (slug)</label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(slugify(e.target.value));
              }}
              required
            />
            <p className="meta" style={{ margin: "0.35rem 0 0" }}>
              Public page: <code>/{slugify(slug) || "…"}</code> · Must be unique.
            </p>
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
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
