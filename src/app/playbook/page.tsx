import type { Metadata } from "next";
import Link from "next/link";
import { BrandMasthead } from "@/components/BrandMasthead";

export const metadata: Metadata = {
  title: "Organizer playbook",
  description:
    "How to create activities, upload certificate designs, place fields, import recipients, and publish with Rotaract Certify by Rotaract South Asia MDIO.",
  openGraph: {
    title: "Organizer playbook | Rotaract Certify | Rotaract South Asia MDIO"
  }
};

const STEPS = [
  {
    title: "Create the activity",
    body: "In the organizer workspace, create a new activity with a clear title, description, and date. It starts as a draft — only you can see it until you publish."
  },
  {
    title: "Upload designs",
    body: "Add one or more PNG certificate designs (for example gold, silver, bronze). Give each design a short key. Keep the longest edge at or under 3000px so downloads stay reliable on phones."
  },
  {
    title: "Add recipients and certificate fields",
    body: "Define which columns appear on certificates, then import a CSV or Google Sheet, or add recipients one by one. Every recipient needs a unique lookup (email or redeem code). Assign a design key when you use more than one artwork."
  },
  {
    title: "Place text on each design",
    body: "On Placement, position name and other certificate fields on the artwork. Each design can have its own layout. Use a tablet or desktop for drag-to-position."
  },
  {
    title: "Publish and share",
    body: "Set status to Active and save. Copy the public link and share it on WhatsApp or email so members can find and download their certificates."
  },
  {
    title: "Support your members",
    body: "If someone’s email or code is not found, check the recipient list first. Escalation: organizers → rsamdio@gmail.com → ZeoSpec for platform issues."
  }
] as const;

export default function PlaybookPage() {
  return (
    <main className="container legal-page">
      <BrandMasthead compact lead="A short path from draft activity to downloaded certificates." />

      <p className="activity-back">
        <Link href="/">← Back to Rotaract Certify</Link>
        {" · "}
        <Link href="/admin">Organizer sign-in</Link>
      </p>

      <section className="card activity-hero rise">
        <div className="activity-hero-meta">
          <span className="quiet-status">For organizers</span>
        </div>
        <h1 className="activity-hero-title">Organizer playbook</h1>
        <p className="activity-hero-lead">
          Follow this order in the admin workspace: Details → Design → Recipients → Placement →
          Managers.
        </p>
      </section>

      <ol className="playbook-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="card playbook-step rise">
            <span className="playbook-step-num" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="card admin-panel stack" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ margin: 0 }}>Need access?</h2>
        <p className="meta" style={{ margin: 0 }}>
          Rotaract Certify is invite-only. Reach out to your RSAMDIO contact or{" "}
          <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a> if you should be an organizer.
          Already invited?{" "}
          <Link href="/admin">Sign in with Google</Link>.
        </p>
      </section>
    </main>
  );
}
