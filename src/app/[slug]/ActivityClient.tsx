"use client";

import { useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { CertificateFontsLink } from "@/components/CertificateFontsLink";
import { resolveFieldsForDesign } from "@/lib/field-placement";
import { markCertificateDownloaded, verifyCertificate } from "@/lib/callables";
import { trackEvent } from "@/lib/analytics";
import type { Activity, Participant } from "@/types/domain";

type Props = {
  activity: Activity;
};

function isRateLimited(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "functions/resource-exhausted";
}

export function ActivityClient({ activity }: Props) {
  const [lookup, setLookup] = useState("");
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [token, setToken] = useState("");
  const [resolvedTemplateUrl, setResolvedTemplateUrl] = useState("");
  const [resolvedTemplateKey, setResolvedTemplateKey] = useState("");
  const [loadFonts, setLoadFonts] = useState(false);

  const defaultTemplateUrl = useMemo(() => {
    return activity.templates[activity.defaultTemplateKey]?.url ?? "";
  }, [activity]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError("");
    setParticipant(null);
    trackEvent("lookup_submit", { slug: activity.slug });
    try {
      const result = await verifyCertificate(activity.slug, lookup);
      if (!result.found || !result.participant) {
        trackEvent("lookup_miss", { slug: activity.slug });
        setError("We couldn’t find a certificate for that lookup. Please check and try again.");
        return;
      }
      trackEvent("lookup_found", { slug: activity.slug });
      setParticipant(result.participant);
      setToken(result.downloadToken ?? "");
      setResolvedTemplateUrl(result.templateUrl ?? defaultTemplateUrl);
      setResolvedTemplateKey(result.participant.templateKey || activity.defaultTemplateKey || "");
      setLoadFonts(true);
    } catch (err) {
      if (isRateLimited(err)) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError("Something went wrong. Please try again in a moment.");
      }
    } finally {
      setSearching(false);
    }
  }

  async function onDownload() {
    if (!participant) return;
    setDownloading(true);
    setError("");
    setLoadFonts(true);
    trackEvent("download_start", { slug: activity.slug });
    try {
      const { renderCertificateCanvas, generatePdfFromCanvas } = await import(
        "@/lib/certificate/renderer"
      );
      const designKey = participant.templateKey || resolvedTemplateKey;
      const canvas = await renderCertificateCanvas({
        templateUrl: resolvedTemplateUrl || defaultTemplateUrl,
        participant,
        fields: resolveFieldsForDesign(activity, designKey)
      });
      const pdf = await generatePdfFromCanvas(canvas);
      pdf.save(`certificate-${activity.slug}-${participant.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
      if (token) {
        await markCertificateDownloaded({
          activitySlug: activity.slug,
          participantId: participant.id,
          downloadToken: token
        });
      }
      trackEvent("download_success", { slug: activity.slug });
    } catch {
      trackEvent("download_error", { slug: activity.slug });
      setError("We couldn’t prepare your certificate. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (activity.status !== "active") {
    return (
      <section className="card empty-state">
        <h3>This activity is closed</h3>
        <p>
          Certificates for this program are no longer available to download. If you already received yours,
          keep the PDF you saved.
        </p>
      </section>
    );
  }

  return (
    <div className="lookup-shell">
      {loadFonts ? <CertificateFontsLink /> : null}
      <section className="card lookup-card stack">
        <div>
          <h2 className="lookup-title">Get your certificate</h2>
          <p className="meta lookup-copy">
            Enter the email or code your organizers shared with you.
          </p>
        </div>

        <form onSubmit={onSearch} className="stack">
          <div className="field">
            <label htmlFor="lookup">Email or code</label>
            <input
              id="lookup"
              className="field-soft"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Email or redeem code"
              autoComplete="off"
              autoFocus
              required
              disabled={searching || downloading}
            />
          </div>
          <button className="btn btn-block" type="submit" disabled={searching || downloading}>
            {searching ? "Checking…" : "Find my certificate"}
          </button>
        </form>

        {error ? (
          <p className="status-error" style={{ margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}

        {participant ? (
          <div className="card success-panel">
            <p style={{ marginTop: 0 }}>
              We found a certificate for <strong>{participant.name}</strong>
            </p>
            <button
              className="btn btn-success"
              type="button"
              onClick={onDownload}
              disabled={searching || downloading}
            >
              {downloading ? "Preparing your certificate…" : "Download certificate"}
            </button>
          </div>
        ) : null}
      </section>

      <aside className="card tips-card stack">
        <h3 className="tips-title">Helpful tips</h3>
        <ol className="tips-list">
          <li>
            <strong>Use your registration email</strong>
            <span>Enter it exactly as you registered for the activity.</span>
          </li>
          <li>
            <strong>Redeem codes</strong>
            <span>Spaces don’t matter. Check carefully for O versus 0.</span>
          </li>
          <li>
            <strong>Still stuck?</strong>
            <span>Reach out to your activity organizers for help.</span>
          </li>
        </ol>
        <a className="tips-link" href="mailto:rsamdio@gmail.com">
          Contact support →
        </a>
      </aside>
    </div>
  );
}
