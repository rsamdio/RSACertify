type Props = {
  lead?: string;
  compact?: boolean;
  /** Use h1 on the homepage; activity pages keep the activity title as h1. */
  asHeading?: boolean;
};

export function BrandMasthead({
  lead = "Find your activity and download your verified certificate.",
  compact = false,
  asHeading = false
}: Props) {
  const ProductTag = asHeading ? "h1" : "p";

  return (
    <header
      className={`brand-masthead${compact ? " is-compact" : ""}`}
      aria-label="Rotaract Certify"
    >
      <img
        className="brand-masthead-mark"
        src="/assets/images/rsamdio.webp"
        alt="Rotaract South Asia MDIO"
        width={compact ? 88 : 108}
        height={compact ? 88 : 108}
      />
      <ProductTag className={asHeading ? "brand-masthead-title" : "brand-masthead-product"}>
        Rotaract Certify
      </ProductTag>
      <p className="brand-masthead-byline">by Rotaract South Asia MDIO</p>
      {lead ? <p className="brand-masthead-lead">{lead}</p> : null}
    </header>
  );
}
