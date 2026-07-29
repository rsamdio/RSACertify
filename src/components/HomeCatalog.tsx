"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type CatalogItem = {
  slug: string;
  title: string;
  description: string;
  date?: string;
  status: "active" | "closed";
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function HomeCatalog({
  activities,
  priority = false
}: {
  activities: CatalogItem[];
  priority?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q)
      );
    });
  }, [activities, query]);

  return (
    <section
      id="certificates"
      className={`section catalog-section${priority ? " catalog-priority" : ""}`}
    >
      <div className="catalog-toolbar">
        <div>
          <h2>Certificates</h2>
          <p className="catalog-count">
            {filtered.length}{" "}
            {filtered.length === 1 ? "activity" : "activities"}
            {query.trim() ? " match your search" : " available"}
          </p>
        </div>
        <div className="search-field catalog-search">
          <label className="sr-only" htmlFor="catalog-search">
            Search certificates
          </label>
          <input
            id="catalog-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or keyword"
            aria-label="Search certificates"
            autoFocus={priority}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state empty-state-quiet">
          <h3>No activities found</h3>
          <p>
            {activities.length === 0
              ? "New certificates will appear here when organizers publish them."
              : "Try another search, or clear it to see everything available."}
          </p>
          {query.trim() ? (
            <button className="btn btn-secondary" type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="catalog-cards">
          {filtered.map((activity) => (
            <li key={activity.slug}>
              <Link
                className="catalog-card"
                href={`/${activity.slug}`}
                aria-label={`${activity.title} certificate`}
              >
                <div className="catalog-card-top">
                  {activity.date ? (
                    <time className="catalog-card-date" dateTime={activity.date}>
                      {formatDate(activity.date)}
                    </time>
                  ) : (
                    <span className="catalog-card-date">Date TBA</span>
                  )}
                  <span className="status-dot status-active">Open</span>
                </div>
                <h3 className="catalog-card-title">{activity.title}</h3>
                <p className="catalog-card-desc">
                  {activity.description || "Download your verified certificate for this activity."}
                </p>
                <span className="catalog-card-cta">
                  Get certificate <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
