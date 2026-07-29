import type {
  Activity,
  FieldPlacement,
  ParticipantField,
  ParticipantFieldSchema,
  TemplateConfig
} from "@/types/domain";

export const DEFAULT_FIELD_PLACEMENT: FieldPlacement = {
  x: "50%",
  y: "48%",
  font_size: 28,
  font_family: "Georgia",
  color: "#0b2f6b",
  width: "70%",
  text_align: "center",
  bold: false,
  italic: false
};

const STYLE_KEYS = [
  "x",
  "y",
  "font_size",
  "font_family",
  "color",
  "width",
  "height",
  "text_align",
  "bold",
  "italic"
] as const;

export function defaultPlacementForField(fieldKey: string, index = 0): FieldPlacement {
  if (fieldKey === "name") return { ...DEFAULT_FIELD_PLACEMENT };
  const y = Math.min(48 + (index + 1) * 8, 85);
  return {
    ...DEFAULT_FIELD_PLACEMENT,
    y: `${y}%`,
    font_size: 22,
    color: "#1c1216",
    width: "60%"
  };
}

export function placementFromLegacyField(field: ParticipantField): FieldPlacement {
  return {
    x: field.x ?? DEFAULT_FIELD_PLACEMENT.x,
    y: field.y ?? DEFAULT_FIELD_PLACEMENT.y,
    font_size: field.font_size ?? DEFAULT_FIELD_PLACEMENT.font_size,
    font_family: field.font_family || DEFAULT_FIELD_PLACEMENT.font_family,
    color: field.color || DEFAULT_FIELD_PLACEMENT.color,
    width: field.width ?? DEFAULT_FIELD_PLACEMENT.width,
    ...(field.height !== undefined ? { height: field.height } : {}),
    text_align: field.text_align || DEFAULT_FIELD_PLACEMENT.text_align,
    bold: Boolean(field.bold),
    italic: Boolean(field.italic)
  };
}

export function toFieldSchema(field: ParticipantField): ParticipantFieldSchema {
  return {
    key: field.key,
    label: field.label,
    ...(field.required !== undefined ? { required: field.required } : {}),
    ...(field.onCertificate !== undefined ? { onCertificate: field.onCertificate } : {})
  };
}

export function stripParticipantFieldsToSchema(fields: ParticipantField[]): ParticipantFieldSchema[] {
  return fields.map(toFieldSchema);
}

export function fieldHasLegacyStyle(field: ParticipantField): boolean {
  return STYLE_KEYS.some((key) => field[key] !== undefined && field[key] !== null);
}

export function buildFieldsMapFromSchema(
  schema: ParticipantField[],
  source?: Record<string, FieldPlacement> | null
): Record<string, FieldPlacement> {
  const out: Record<string, FieldPlacement> = {};
  schema.forEach((field, index) => {
    if (source?.[field.key]) {
      out[field.key] = { ...source[field.key] };
    } else if (fieldHasLegacyStyle(field)) {
      out[field.key] = placementFromLegacyField(field);
    } else {
      out[field.key] = defaultPlacementForField(field.key, index);
    }
  });
  return out;
}

/** Ensure every template has a fields map; seed from legacy participantFields when missing. */
export function hydrateActivityPlacements(activity: Activity): Activity {
  const schema = activity.participantFields || [];
  const templates = { ...(activity.templates || {}) };
  let changed = false;

  const legacySource = buildFieldsMapFromSchema(schema);

  for (const [key, config] of Object.entries(templates)) {
    if (!config?.url) continue;
    if (config.fields && Object.keys(config.fields).length > 0) {
      // Ensure every schema key exists on this design
      const nextFields = { ...config.fields };
      let localChange = false;
      schema.forEach((field, index) => {
        if (!nextFields[field.key]) {
          nextFields[field.key] =
            legacySource[field.key] || defaultPlacementForField(field.key, index);
          localChange = true;
        }
      });
      if (localChange) {
        templates[key] = { ...config, fields: nextFields };
        changed = true;
      }
      continue;
    }
    templates[key] = {
      ...config,
      fields: { ...legacySource }
    };
    changed = true;
  }

  const stripped = stripParticipantFieldsToSchema(schema) as ParticipantField[];
  const needsStrip = schema.some(fieldHasLegacyStyle);

  if (!changed && !needsStrip) return activity;

  return {
    ...activity,
    templates,
    participantFields: stripped
  };
}

export function resolveDesignKey(activity: Activity, templateKey?: string): string {
  const key = (templateKey || "").trim();
  if (key && activity.templates[key]?.url) return key;
  const def = (activity.defaultTemplateKey || "").trim();
  if (def && activity.templates[def]?.url) return def;
  return Object.keys(activity.templates || {}).find((k) => activity.templates[k]?.url) || "";
}

/** Merge schema + per-design placement for rendering / placement UI. */
export function resolveFieldsForDesign(
  activity: Activity,
  templateKey?: string
): ParticipantField[] {
  const designKey = resolveDesignKey(activity, templateKey);
  const designFields = designKey ? activity.templates[designKey]?.fields : undefined;

  return (activity.participantFields || []).map((field, index) => {
    const placement =
      designFields?.[field.key] ||
      (fieldHasLegacyStyle(field)
        ? placementFromLegacyField(field)
        : defaultPlacementForField(field.key, index));
    return {
      ...toFieldSchema(field),
      ...placement
    };
  });
}

export function updateDesignFieldPlacement(
  activity: Activity,
  designKey: string,
  fieldKey: string,
  patch: Partial<FieldPlacement>
): Activity {
  const template = activity.templates[designKey];
  if (!template) return activity;
  const current =
    template.fields?.[fieldKey] ||
    placementFromLegacyField(
      activity.participantFields.find((f) => f.key === fieldKey) || {
        key: fieldKey,
        label: fieldKey
      }
    );
  return {
    ...activity,
    templates: {
      ...activity.templates,
      [designKey]: {
        ...template,
        fields: {
          ...(template.fields || {}),
          [fieldKey]: { ...current, ...patch }
        }
      }
    }
  };
}

export function seedTemplateFields(
  activity: Activity,
  newKey: string,
  url: string
): TemplateConfig {
  const copyFrom =
    (activity.defaultTemplateKey && activity.templates[activity.defaultTemplateKey]?.fields) ||
    Object.values(activity.templates).find((t) => t.fields && Object.keys(t.fields).length)?.fields ||
    null;
  return {
    url,
    fields: buildFieldsMapFromSchema(activity.participantFields || [], copyFrom)
  };
}

/** Add a placement entry for a new schema field across all designs. */
export function addFieldPlacementToAllDesigns(
  activity: Activity,
  fieldKey: string,
  index: number
): Activity {
  const templates = { ...activity.templates };
  const placement = defaultPlacementForField(fieldKey, index);
  for (const [key, config] of Object.entries(templates)) {
    if (!config?.url) continue;
    templates[key] = {
      ...config,
      fields: {
        ...(config.fields || {}),
        [fieldKey]: config.fields?.[fieldKey] || placement
      }
    };
  }
  return { ...activity, templates };
}

export function removeFieldPlacementFromAllDesigns(activity: Activity, fieldKey: string): Activity {
  const templates = { ...activity.templates };
  for (const [key, config] of Object.entries(templates)) {
    if (!config?.fields?.[fieldKey]) continue;
    const nextFields = { ...config.fields };
    delete nextFields[fieldKey];
    templates[key] = { ...config, fields: nextFields };
  }
  return { ...activity, templates };
}

export function canvasFontString(
  fontSize: number,
  fontFamily: string,
  bold?: boolean,
  italic?: boolean
): string {
  const style = italic ? "italic " : "";
  const weight = bold ? "bold " : "";
  return `${style}${weight}${fontSize}px "${fontFamily}"`;
}
