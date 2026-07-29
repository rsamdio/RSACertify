import type { Activity, ParticipantField } from "@/types/domain";
import { DEFAULT_FIELD_PLACEMENT } from "@/lib/field-placement";

/** Schema-only defaults; placement is seeded when the first design is uploaded. */
export const DEFAULT_PARTICIPANT_FIELDS: ParticipantField[] = [
  {
    key: "name",
    label: "Name",
    required: true,
    onCertificate: true
  }
];

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function createActivityDefaults(input: {
  slug: string;
  title: string;
  description: string;
  date?: string;
}): Activity {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    date: input.date || undefined,
    status: "draft",
    templates: {},
    defaultTemplateKey: "",
    participantFields: DEFAULT_PARTICIPANT_FIELDS,
    participantsCount: 0,
    certificatesCount: 0
  };
}

export { DEFAULT_FIELD_PLACEMENT };
