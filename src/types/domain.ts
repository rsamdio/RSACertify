export type ActivityStatus = "draft" | "active" | "closed";

export type Role = "super" | "platform" | "manager";

/** Shared field schema (People tab). Placement styles live per design. */
export type ParticipantFieldSchema = {
  key: string;
  label: string;
  required?: boolean;
  /** When false, field is for import/records only and is not drawn on the certificate. */
  onCertificate?: boolean;
};

/** Per-design placement / typography for one field. */
export type FieldPlacement = {
  x: string | number;
  y: string | number;
  font_size: number;
  font_family: string;
  color: string;
  width: string | number;
  height?: number;
  text_align: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
};

/**
 * Resolved field used by the canvas renderer (schema + placement).
 * Style props may still appear on stored participantFields during migration.
 */
export type ParticipantField = ParticipantFieldSchema & Partial<FieldPlacement> & {
  x?: string | number;
  y?: string | number;
  font_size?: number;
  font_family?: string;
  color?: string;
  width?: string | number;
  text_align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
};

export type TemplateConfig = {
  url: string;
  /** Placement styles keyed by participant field key. */
  fields?: Record<string, FieldPlacement>;
};

export type Activity = {
  slug: string;
  title: string;
  description: string;
  status: ActivityStatus;
  date?: string;
  seo?: {
    keywords?: string;
    author?: string;
    ogType?: string;
    /** @deprecated Sitewide OG image only — not editable / not used for previews. */
    ogImage?: string;
    schemaType?: string;
    robots?: string;
  };
  templates: Record<string, TemplateConfig>;
  defaultTemplateKey: string;
  participantFields: ParticipantField[];
  participantsCount?: number;
  certificatesCount?: number;
};

export type Participant = {
  id: string;
  name: string;
  /** Email, redeem code, or any value participants use to find their certificate. */
  lookup: string;
  certificateStatus?: "pending" | "downloaded";
  templateKey?: string;
  additionalFields?: Record<string, string>;
};
