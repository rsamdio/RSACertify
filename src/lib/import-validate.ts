import { toLookupKey } from "@/lib/security";

export const DESIGN_CSV_HEADERS = ["design", "template_key", "templatekey"] as const;
export const RESERVED_DESIGN_KEY = "default";

export type ImportDraftRow = {
  id: string;
  name: string;
  lookup: string;
  templateKey: string;
  additionalFields: Record<string, string>;
};

export type ImportRowIssue = {
  code: "missing_name" | "missing_lookup" | "duplicate_lookup" | "unknown_design" | "reserved_design";
  message: string;
};

export type ValidatedImportRow = ImportDraftRow & {
  issues: ImportRowIssue[];
  ok: boolean;
};

export function isReservedDesignKey(key: string): boolean {
  return key.trim().toLowerCase() === RESERVED_DESIGN_KEY;
}

export function parseImportCsvTable(
  table: string[][],
  options?: { existingLookups?: Set<string>; designKeys?: Set<string> }
): ValidatedImportRow[] {
  if (table.length < 2) return [];
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const lookupIdx = headers.indexOf("lookup");
  if (nameIdx < 0 || lookupIdx < 0) {
    throw new Error("Your file needs name and lookup columns");
  }
  const templateIdx = headers.findIndex((h) => (DESIGN_CSV_HEADERS as readonly string[]).includes(h));
  const reserved = new Set<string>(["name", "lookup", ...DESIGN_CSV_HEADERS]);

  const drafts: ImportDraftRow[] = table.slice(1).map((cols, index) => {
    const additionalFields: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (reserved.has(header)) return;
      if (cols[idx]) additionalFields[header] = cols[idx];
    });
    const rawDesign =
      templateIdx >= 0 ? String(cols[templateIdx] || "").trim().toLowerCase() : "";
    return {
      id: `row-${index + 1}`,
      name: String(cols[nameIdx] || "").trim(),
      lookup: String(cols[lookupIdx] || "").trim(),
      templateKey: rawDesign,
      additionalFields
    };
  });

  return validateImportRows(drafts, options);
}

export function validateImportRows(
  rows: ImportDraftRow[],
  options?: {
    existingLookups?: Set<string>;
    designKeys?: Set<string>;
    excludeParticipantId?: string;
  }
): ValidatedImportRow[] {
  const existing = options?.existingLookups || new Set<string>();
  const designKeys = options?.designKeys || new Set<string>();
  const normalizedInFile = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const key = row.lookup ? toLookupKey(row.lookup) : "";
    if (!key) return;
    const list = normalizedInFile.get(key) || [];
    list.push(index);
    normalizedInFile.set(key, list);
  });

  return rows.map((row) => {
    const issues: ImportRowIssue[] = [];
    if (!row.name.trim()) {
      issues.push({ code: "missing_name", message: "Name is required." });
    }
    const lookupNorm = row.lookup ? toLookupKey(row.lookup) : "";
    if (!lookupNorm) {
      issues.push({ code: "missing_lookup", message: "Lookup is required." });
    } else {
      const peers = normalizedInFile.get(lookupNorm) || [];
      if (peers.length > 1) {
        issues.push({
          code: "duplicate_lookup",
          message: "Lookup is duplicated in this import."
        });
      }
      if (existing.has(lookupNorm)) {
        issues.push({
          code: "duplicate_lookup",
          message: "Lookup already exists for this activity."
        });
      }
    }

    const design = row.templateKey.trim().toLowerCase();
    if (design) {
      if (isReservedDesignKey(design)) {
        issues.push({
          code: "reserved_design",
          message: "Design key “default” is reserved. Leave blank to use the activity default."
        });
      } else if (!designKeys.has(design)) {
        issues.push({
          code: "unknown_design",
          message: `Design key “${design}” is not uploaded for this activity.`
        });
      }
    }

    return { ...row, issues, ok: issues.length === 0 };
  });
}

export function existingLookupSet(
  participants: Array<{ id: string; lookup?: string }>,
  excludeId?: string
): Set<string> {
  const set = new Set<string>();
  for (const p of participants) {
    if (excludeId && p.id === excludeId) continue;
    if (p.lookup) set.add(toLookupKey(p.lookup));
  }
  return set;
}
