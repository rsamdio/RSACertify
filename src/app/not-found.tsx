import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found"
};

export default function NotFound() {
  return (
    <main className="container" style={{ padding: "2.4rem 0" }}>
      <section className="card empty-state rise">
        <h1 style={{ color: "var(--cranberry)", fontFamily: "var(--font-display)" }}>
          Page not found
        </h1>
        <p>That certificate page may be unavailable, or the link may be incorrect.</p>
        <Link className="btn" href="/">
          Back to Rotaract Certify
        </Link>
      </section>
    </main>
  );
}
