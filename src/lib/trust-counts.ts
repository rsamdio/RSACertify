/** Aggregate trust/count helpers for public activity pages (no PII). */

export function formatActivityTrust(
  recipients?: number | null,
  downloaded?: number | null
): string | null {
  const n = Math.max(0, Number(recipients) || 0);
  if (n <= 0) return null;
  const m = Math.max(0, Math.min(n, Number(downloaded) || 0));
  const pct = Math.round((m / n) * 100);
  const recipientLabel = n === 1 ? "recipient" : "recipients";
  return `${n} ${recipientLabel} · ${m} downloaded (${pct}%)`;
}
