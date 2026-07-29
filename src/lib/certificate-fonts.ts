/** Canvas-safe fonts for certificate placement (system + loaded web fonts). */
export const CERTIFICATE_FONTS = [
  // Scripts (names)
  "Great Vibes",
  "Pinyon Script",
  // Classic / display serifs
  "EB Garamond",
  "Libre Baskerville",
  "Cormorant Garamond",
  "Crimson Pro",
  "Playfair Display",
  "Merriweather",
  "Newsreader",
  "Georgia",
  "Times New Roman",
  "Palatino Linotype",
  "Garamond",
  // Sans
  "Poppins",
  "Josefin Sans",
  "Nunito",
  "Montserrat",
  "Fira Sans",
  "Open Sans",
  "Lato",
  "Roboto",
  "Source Sans 3",
  "Arial",
  "Helvetica",
  "Verdana",
  "Trebuchet MS",
  "Segoe UI",
  // Mono
  "Courier New"
] as const;

export type CertificateFont = (typeof CERTIFICATE_FONTS)[number];

/** Google Fonts stylesheet — includes italic + bold weights used on certificates. */
export const CERTIFICATE_WEB_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400;1,700",
    "family=Crimson+Pro:ital,wght@0,400;0,700;1,400;1,700",
    "family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700",
    "family=Fira+Sans:ital,wght@0,400;0,600;1,400;1,600",
    "family=Great+Vibes",
    "family=Josefin+Sans:ital,wght@0,400;0,600;1,400;1,600",
    "family=Lato:ital,wght@0,400;0,700;1,400;1,700",
    "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400",
    "family=Merriweather:ital,wght@0,400;0,700;1,400;1,700",
    "family=Montserrat:ital,wght@0,400;0,600;1,400;1,600",
    // Newsreader + Source Sans 3 come from next/font on the site shell — omit duplicate CSS.
    "family=Nunito:ital,wght@0,400;0,700;1,400;1,700",
    "family=Open+Sans:ital,wght@0,400;0,600;1,400;1,600",
    "family=Pinyon+Script",
    "family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600",
    "family=Poppins:ital,wght@0,400;0,600;1,400;1,600",
    "family=Roboto:ital,wght@0,400;0,500;1,400;1,500"
  ].join("&") +
  "&display=swap";

export function normalizeHexColor(value: string, fallback = "#1c1216"): string {
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}
