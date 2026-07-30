import { getCatalogActivities } from "@/lib/server-data";
import { descriptionToPlainText } from "@/lib/rich-text";

export const revalidate = 300;

export async function GET() {
  const activities = await getCatalogActivities();
  const lines = [
    "# Rotaract Certify",
    "",
    "> Digital certificates for Rotaract activities, by Rotaract South Asia MDIO (RSAMDIO).",
    "",
    "- Site: https://certify.rsamdio.org/",
    "- Parent org: Rotaract South Asia MDIO — https://rsamdio.org/",
    "- Support: rsamdio@gmail.com",
    "",
    "## How certificate lookup works",
    "",
    "1. Open an activity page from the catalog (or a shared link).",
    "2. Enter the email or redeem code your organizers shared.",
    "3. Download your PDF certificate if a match is found.",
    "",
    "Lookup requires an exact match. Recipient lists are never public.",
    "",
    "## Privacy boundary",
    "",
    "- Do not index or cite individual recipient names, emails, or redeem codes.",
    "- Public content is limited to activity titles, descriptions, and download instructions.",
    "",
    "## Public routes",
    "",
    "- [/](https://certify.rsamdio.org/) — activity catalog",
    "- [/{slug}/](https://certify.rsamdio.org/) — certificate lookup for one activity",
    "- [/privacy/](https://certify.rsamdio.org/privacy/) — Privacy Policy",
    "- [/terms/](https://certify.rsamdio.org/terms/) — Terms and Conditions",
    "- [/playbook/](https://certify.rsamdio.org/playbook/) — organizer how-to",
    "- [Rotaract Library](https://library.rsamdio.org/) — club templates and checklists",
    "",
    "## Active activities",
    ""
  ];

  if (activities.length === 0) {
    lines.push("_No active activities published yet._");
  } else {
    for (const activity of activities) {
      lines.push(
        `- [${activity.title}](https://certify.rsamdio.org/${activity.slug}/) — ${descriptionToPlainText(activity.description) || "Certificate download"}`
      );
    }
  }

  lines.push("");
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
    }
  });
}
