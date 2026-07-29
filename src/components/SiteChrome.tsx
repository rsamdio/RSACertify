"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SoftScrollLink } from "@/components/SoftScroll";

const similarTools = [
  {
    title: "Club Invoice Calculator",
    description: "Estimate club invoices quickly and accurately.",
    href: "https://dues.rsamdio.org"
  },
  {
    title: "Rotaract Buddy",
    description: "Ask questions about Rotary and Rotaract anytime.",
    href: "https://buddy.rsamdio.org/"
  },
  {
    title: "NAVIGATE",
    description: "Guided pathways for your Rotaract journey.",
    href: "https://navigate.rsamdio.org/"
  },
  {
    title: "Rotaract Library",
    description: "Templates, checklists, and tools for clubs.",
    href: "https://library.rsamdio.org/"
  },
  {
    title: "Publications Hub",
    description: "District publications from across South Asia.",
    href: "https://publications.rsamdio.org/"
  },
  {
    title: "News Submission",
    description: "Share updates for the Rotaract News Magazine.",
    href: "https://connect.rsamdio.org/rotaractnews"
  },
  {
    title: "Pulse",
    description: "Live rooms for Rotaract events and engagement.",
    href: "https://pulse.rsamdio.org/"
  }
];

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div>
          <h4>Rotaract Certify</h4>
          <p>
            An official Rotaract South Asia MDIO initiative helping members celebrate service and
            leadership with trusted digital certificates.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <p>
            <SoftScrollLink targetId="certificates">Find your certificate</SoftScrollLink>
          </p>
          <p>
            <SoftScrollLink targetId="how-it-works">How it works</SoftScrollLink>
          </p>
          <p>
            <Link href="/privacy">Privacy</Link>
          </p>
          <p>
            <Link href="/terms">Terms</Link>
          </p>
        </div>
        <div>
          <h4>Contact</h4>
          <p>
            <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a>
          </p>
          <p>
            Built with care by{" "}
            <a href="https://zeospec.com" target="_blank" rel="noopener noreferrer">
              ZeoSpec
            </a>
          </p>
        </div>
        <div>
          <h4>For organizers</h4>
          <p>
            <Link href="/admin">Organizer sign-in</Link>
          </p>
          <p>
            <Link href="/playbook">Playbook: create → publish</Link>
          </p>
          <p>Issue certificates for your Rotaract programs and events.</p>
        </div>
      </div>
      <div className="container site-footer-bottom">
        <span>© {year} Rotaract South Asia MDIO. All rights reserved.</span>
        <span>Your certificate is issued only after a successful match.</span>
      </div>
    </footer>
  );
}

export function SimilarTools() {
  return (
    <section className="section tools-section">
      <div className="section-head">
        <div>
          <h2>More from RSAMDIO</h2>
          <p>Helpful tools for Rotaractors across South Asia</p>
        </div>
      </div>
      <div className="tools-grid">
        {similarTools.map((tool) => (
          <a
            key={tool.href}
            className="tool-card-soft"
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>{tool.title}</strong>
            <span>{tool.description}</span>
            <em>Visit →</em>
          </a>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section how-section">
      <div className="section-head">
        <div>
          <h2>How it works</h2>
          <p>Three simple steps to your certificate.</p>
        </div>
      </div>
      <ol className="steps-flow">
        <li>
          <span className="steps-flow-num">01</span>
          <div>
            <h3>Find your activity</h3>
            <p>Choose the program or event you took part in.</p>
          </div>
        </li>
        <li>
          <span className="steps-flow-num">02</span>
          <div>
            <h3>Confirm with your lookup</h3>
            <p>Use the email, code, or other identifier shared by your organizers.</p>
          </div>
        </li>
        <li>
          <span className="steps-flow-num">03</span>
          <div>
            <h3>Download your certificate</h3>
            <p>Get your verified certificate from Rotaract Certify instantly.</p>
          </div>
        </li>
      </ol>
    </section>
  );
}
