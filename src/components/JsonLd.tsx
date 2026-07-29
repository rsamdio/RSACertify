type Props = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

/** JSON-LD is not executed as script; omit nonce to avoid CSP hydration mismatches. */
export function JsonLd({ data }: Props) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((item, index) => (
        <script
          // eslint-disable-next-line react/no-danger
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
