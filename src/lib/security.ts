export function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCode(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function toLookupKey(value: string): string {
  return isLikelyEmail(value) ? normalizeLookupKey(value) : normalizeCode(value);
}

/**
 * Firestore document IDs can't contain "/" and can't be exactly "." or "..".
 * Lookups are normalized emails or codes, so "/" is the only realistic offender —
 * must stay aligned with server `toLookupDocId` in functions/src/participants.ts.
 */
export function toLookupDocId(lookup: string): string {
  const cleaned = lookup.replace(/\//g, "_").slice(0, 1500);
  return cleaned === "." || cleaned === ".." ? `_${cleaned}` : cleaned;
}
