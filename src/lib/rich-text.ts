import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "span"
];

const ALLOWED_SIZE_CLASSES = new Set(["desc-size-lg", "desc-size-xl"]);

/** True when the string looks like HTML markup rather than plain text. */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim());
}

/**
 * Sanitize organizer description HTML.
 * Allowlist only: paragraphs, breaks, bold/italic/underline/strike, lists, size spans.
 */
export function sanitizeDescriptionHtml(html: string): string {
  if (!html || !html.trim()) return "";

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["class"],
    ALLOW_DATA_ATTR: false
  });

  // Only keep named size classes on spans.
  const withSafeSpans = clean.replace(/<span\b([^>]*)>/gi, (_full, attrs: string) => {
    const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    if (!classMatch) return "<span>";
    const kept = classMatch[1]
      .split(/\s+/)
      .filter((c) => ALLOWED_SIZE_CLASSES.has(c));
    if (!kept.length) return "<span>";
    return `<span class="${kept.join(" ")}">`;
  });

  // Soft line breaks mid-sentence (legacy plain-text → <br>) should flow as normal wrap.
  return withSafeSpans.replace(/(\S)<br\s*\/?>(\S)/gi, "$1 $2");
}

/** Convert legacy plain text into editor-safe paragraph HTML. */
export function plainTextToEditorHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Blank line → new paragraph; single newlines inside a block become spaces (natural wrap).
  const blocks = escaped.split(/\n\n+/);
  return blocks
    .map((block) => {
      const flowed = block.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
      return `<p>${flowed || "<br>"}</p>`;
    })
    .join("");
}

/**
 * Normalize any stored description into HTML TipTap can load.
 * Plain text with newlines becomes paragraphs; existing HTML is sanitized.
 */
export function toEditorHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return sanitizeDescriptionHtml(trimmed);
  return plainTextToEditorHtml(value);
}

/** Strip markup for catalog cards, OG/meta, JSON-LD, and search. */
export function descriptionToPlainText(html: string): string {
  if (!html) return "";
  if (!looksLikeHtml(html)) {
    return html.replace(/\r\n/g, "\n").trim();
  }

  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/\s*h[1-6]\s*>/gi, "\n");

  const stripped = DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true
  });

  return stripped
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isDescriptionEmpty(html: string): boolean {
  return !descriptionToPlainText(html).trim();
}
