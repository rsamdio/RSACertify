import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy a public Google Sheet to CSV so the browser can import without CORS issues.
 * Sheet must be shared as “Anyone with the link”. Hostname allowlist only — no Admin SDK.
 * Organizers who cannot share publicly can download CSV and use file upload instead.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() || "";
  const gidOverride = req.nextUrl.searchParams.get("gid")?.trim() || "";
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

  const exportUrl = toSheetCsvExportUrl(parsed, gidOverride || undefined);
  if (!exportUrl) {
    return NextResponse.json(
      {
        error:
          "Could not read that Sheets link. Use a normal spreadsheet URL (sharing: Anyone with the link), or download CSV and upload the file."
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(exportUrl, {
      headers: { Accept: "text/csv,text/plain,*/*" },
      redirect: "follow",
      cache: "no-store"
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            "Google Sheets returned an error. Share as “Anyone with the link”, or download CSV and upload the file."
        },
        { status: 502 }
      );
    }
    const text = await res.text();
    if (!text.trim() || text.trimStart().startsWith("<!DOCTYPE") || text.includes("<html")) {
      return NextResponse.json(
        {
          error:
            'Could not download CSV. Make sure the sheet is shared as "Anyone with the link", or download CSV and upload the file.'
        },
        { status: 502 }
      );
    }
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 502 });
  }
}

function toSheetCsvExportUrl(url: URL, gidOverride?: string): string | null {
  const path = url.pathname;

  if (path.includes("/export") || path.includes("/pub")) {
    const out = new URL(url.toString());
    if (!out.searchParams.get("format") && !out.searchParams.get("output")) {
      out.searchParams.set("format", "csv");
    }
    if (out.searchParams.has("output") && out.searchParams.get("output") !== "csv") {
      out.searchParams.set("output", "csv");
    }
    if (gidOverride) out.searchParams.set("gid", gidOverride);
    return out.toString();
  }

  const match = path.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const id = match[1];
  const gid = gidOverride || url.searchParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}
