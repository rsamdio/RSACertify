import { NextRequest, NextResponse } from "next/server";

/**
 * List worksheets in a public Google Spreadsheet (exact tab name + gid).
 * Sheet must be shared as “Anyone with the link”. No Admin SDK / auth required.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() || "";
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.hostname !== "docs.google.com") {
    return NextResponse.json({ error: "Only Google Sheets links are supported" }, { status: 400 });
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return NextResponse.json({ error: "Could not read that Sheets link." }, { status: 400 });
  }
  const id = match[1];
  const fallbackGid = parsed.searchParams.get("gid") || "0";

  try {
    const sheets = await listPublicSheets(id);
    if (sheets.length === 0) {
      return NextResponse.json({
        sheets: [{ name: "Sheet1", gid: fallbackGid }]
      });
    }
    return NextResponse.json({ sheets });
  } catch {
    return NextResponse.json({
      sheets: [{ name: "Sheet1", gid: fallbackGid }]
    });
  }
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function listPublicSheets(id: string): Promise<Array<{ name: string; gid: string }>> {
  // htmlview embeds the real tab list as items.push({name, gid})
  const urls = [
    `https://docs.google.com/spreadsheets/d/${id}/htmlview?usp=sharing`,
    `https://docs.google.com/spreadsheets/d/${id}/htmlview`
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*",
        "User-Agent": BROWSER_UA
      },
      redirect: "follow",
      cache: "no-store"
    });
    if (!res.ok) continue;
    const html = await res.text();
    const sheets = parseHtmlViewSheetItems(html);
    if (sheets.length) return sheets;
  }
  return [];
}

/**
 * Google htmlview init script:
 *   items.push({name: "Class Data", pageUrl: "...", gid: "0", initialSheet: ...})
 */
function parseHtmlViewSheetItems(html: string): Array<{ name: string; gid: string }> {
  const sheets: Array<{ name: string; gid: string }> = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(
    /items\.push\(\{\s*name:\s*"((?:\\.|[^"\\])*)"\s*,\s*pageUrl:\s*"(?:\\.|[^"\\])*"\s*,\s*gid:\s*"(-?\d+)"/g
  )) {
    const name = decodeJsString(m[1]).trim();
    const gid = m[2];
    if (!name || seen.has(gid)) continue;
    seen.add(gid);
    sheets.push({ name, gid });
  }

  // Name/gid order can vary slightly across htmlview builds
  if (!sheets.length) {
    for (const m of html.matchAll(
      /items\.push\(\{[^}]*?\bname:\s*"((?:\\.|[^"\\])*)"[^}]*?\bgid:\s*"(-?\d+)"[^}]*?\}/g
    )) {
      const name = decodeJsString(m[1]).trim();
      const gid = m[2];
      if (!name || seen.has(gid)) continue;
      seen.add(gid);
      sheets.push({ name, gid });
    }
  }

  if (!sheets.length) {
    for (const m of html.matchAll(
      /items\.push\(\{[^}]*?\bgid:\s*"(-?\d+)"[^}]*?\bname:\s*"((?:\\.|[^"\\])*)"[^}]*?\}/g
    )) {
      const gid = m[1];
      const name = decodeJsString(m[2]).trim();
      if (!name || seen.has(gid)) continue;
      seen.add(gid);
      sheets.push({ name, gid });
    }
  }

  return sheets;
}

function decodeJsString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/")
      .replace(/\\n/g, " ");
  }
}
