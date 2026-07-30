import { sanitizeDescriptionHtml } from "@/lib/rich-text";

type Props = {
  html: string;
  className?: string;
};

/** Public activity description: sanitize then render allowlisted HTML. */
export function RichDescription({ html, className }: Props) {
  const safe = sanitizeDescriptionHtml(html);
  if (!safe) return null;
  return (
    <div
      className={["rich-description", className].filter(Boolean).join(" ")}
      // eslint-disable-next-line react/no-danger -- sanitized allowlisted HTML only
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
