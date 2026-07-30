import Link from "next/link";
import type { Metadata } from "next";
import { BrandMasthead } from "@/components/BrandMasthead";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Terms and Conditions for Rotaract Certify — rules for using the Rotaract South Asia MDIO certificate service.",
  openGraph: {
    title: "Terms and Conditions | Rotaract Certify | Rotaract South Asia MDIO"
  }
};

export default function TermsPage() {
  return (
    <main className="container legal-page">
      <BrandMasthead compact lead="Rules for using Rotaract Certify." />

      <p className="activity-back">
        <Link href="/">← Back to Rotaract Certify</Link>
        {" · "}
        <Link href="/privacy">Privacy Policy</Link>
      </p>

      <section className="card activity-hero rise">
        <div className="activity-hero-meta">
          <time dateTime="2026-07-29">Last updated 29 July 2026</time>
        </div>
        <h1 className="activity-hero-title">Terms and Conditions</h1>
        <p className="activity-hero-lead">
          Please read these terms carefully before using Rotaract Certify by Rotaract South Asia MDIO.
        </p>
      </section>

      <article className="card legal-content">
        <h2>1. Acceptance of these Terms</h2>
        <p>
          These Terms and Conditions (“Terms”) govern use of Rotaract Certify at{" "}
          <a href="https://certify.rsamdio.org">https://certify.rsamdio.org</a> (the “Service”).
        </p>
        <p>
          The Service is operated by Rotaract South Asia MDIO (“RSAMDIO”, “we”, “us”, or “our”) and
          developed and technically supported by ZeoSpec. By accessing or using the Service, you
          agree to these Terms and the{" "}
          <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
        </p>
        <p>
          If you use the Service for a Rotaract club, activity, or other organization, you confirm
          that you have authority to accept these Terms for that organization.
        </p>

        <h2>2. The Service</h2>
        <p>Rotaract Certify enables:</p>
        <ul>
          <li>public viewing of a catalog of active activities</li>
          <li>
            activity-specific certificate lookup using an email address, redeem code, or other lookup
            value selected by an organizer
          </li>
          <li>browser-based generation and download of digital certificate PDFs</li>
          <li>
            an invitation-only organizer workspace for activity details, certificate designs,
            fields, recipient records, CSV imports, public Google Sheets imports, exports, and
            manager access
          </li>
          <li>role-based administrator and activity-manager access through Google sign-in</li>
        </ul>
        <p>
          The Service is intended for the Rotaract South Asia community and related activities. We
          may change, suspend, or discontinue features where reasonably necessary for operational,
          security, legal, or organizational reasons.
        </p>

        <h2>3. Public use and certificate lookup</h2>
        <p>
          Public visitors may view published activity information. Participant lists are not
          publicly browseable.
        </p>
        <p>
          Certificate lookup requires an activity-specific lookup value. You may use only a lookup
          value that was assigned to you or that you are authorized to use. You must not attempt to
          guess, collect, test, scrape, or use another person’s email address, code, or other lookup
          value to retrieve their certificate information.
        </p>
        <p>
          The Service uses App Check with Google reCAPTCHA v3 and rate limits to help prevent
          automated misuse. You must not bypass, interfere with, or attempt to defeat these
          controls.
        </p>
        <p className="legal-callout">
          A lookup is not identity verification. A correct lookup value may return a certificate, so
          recipients and organizers should protect lookup values from unnecessary disclosure.
        </p>

        <h2>4. Certificates and authenticity</h2>
        <p>
          Certificates are digital records generated from data entered or approved by the relevant
          organizer. A certificate indicates only the participation, achievement, role, or other
          information represented by that organizer’s activity record.
        </p>
        <p>
          RSAMDIO does not guarantee that every certificate is accurate, complete, current, accepted
          by a third party, or suitable for employment, academic, immigration, licensing, financial,
          legal, or other official purposes. A recipient or third party that needs confirmation
          should contact the relevant activity organizer or an appropriate RSAMDIO or Rotary channel.
        </p>
        <p>
          You must not alter a certificate in a misleading way, create a false or misleading
          certificate, represent a certificate as independently verified when it is not, or use a
          certificate to impersonate another person.
        </p>
        <p>
          If RSAMDIO or the relevant organizer determines that a certificate record was created
          through error, fraud, or unauthorized use, they may correct the underlying record,
          discontinue availability of the certificate, or take other appropriate organizational
          action, subject to applicable law.
        </p>

        <h2>5. Organizer accounts and access</h2>
        <p>
          Organizer features are available only to invited platform administrators and activity
          managers who sign in through Google Authentication.
        </p>
        <p>You must:</p>
        <ul>
          <li>use an account you are authorized to use</li>
          <li>keep your Google account and browser session secure</li>
          <li>use access only for the activities and responsibilities assigned to you</li>
          <li>promptly report suspected unauthorized access or misuse to RSAMDIO</li>
          <li>cooperate with reasonable security or access-review requests</li>
        </ul>
        <p>
          Platform administrators may manage activities across the Service. Activity managers may
          manage only the activities for which they are authorized. RSAMDIO may suspend, remove, or
          limit access where reasonably necessary to protect the Service, recipients, organizers,
          or RSAMDIO.
        </p>

        <h2>6. Organizer data responsibilities</h2>
        <p>
          Organizers are responsible for the information, certificate content, designs, and
          instructions they create or upload. Before uploading recipient information, an organizer
          must ensure that they:
        </p>
        <ul>
          <li>
            have a valid legal basis, authority, notice, consent, or other permission required by
            applicable law
          </li>
          <li>collect and upload only information necessary for the activity and certificate</li>
          <li>provide accurate recipient and certificate information</li>
          <li>
            use custom certificate fields responsibly and do not request sensitive information unless
            expressly approved by RSAMDIO and legally permitted
          </li>
          <li>respond appropriately to recipient correction, deletion, and privacy requests</li>
          <li>maintain appropriate access controls for exported files and recipient lists</li>
          <li>
            comply with applicable privacy, safeguarding, intellectual-property, and
            anti-discrimination laws
          </li>
        </ul>

        <h2>7. CSV and Google Sheets imports</h2>
        <p>Organizers may import recipient data from a CSV file or from a public Google Sheet.</p>
        <p>
          A Google Sheet import requires the organizer to share the sheet as “Anyone with the link.”
          This may allow anyone with the link to access the sheet outside the Service. Organizers
          must assess that risk and use CSV upload instead where public-link sharing is not
          appropriate.
        </p>
        <p>
          By providing a Google Sheets URL, you authorize the Service to retrieve the selected public
          sheet for the import. You must not submit a URL to a sheet that you are not authorized to
          access or share.
        </p>

        <h2>8. Certificate designs and intellectual property</h2>
        <p>
          Organizers may upload certificate design images for their activities. You retain
          responsibility for ensuring that you own or have permission to use every design, logo,
          photo, font, trademark, and other material you upload.
        </p>
        <p>
          Design images are stored and publicly delivered through <code>cert.rsamdio.org</code> so
          certificate PDFs can be generated in recipients’ browsers. Do not place confidential or
          personal information in a design image unless you are authorized to make it publicly
          accessible in that manner.
        </p>
        <p>
          The Service, its original software, branding, and content are owned by RSAMDIO, ZeoSpec, or
          their licensors, as applicable. Nothing in these Terms transfers ownership of those rights.
          You may not copy, modify, reverse engineer, distribute, or commercially exploit the Service
          except as permitted by law or with written permission.
        </p>

        <h2>9. Acceptable use</h2>
        <p>You must not use the Service to:</p>
        <ul>
          <li>violate law, privacy rights, intellectual-property rights, or safeguarding obligations</li>
          <li>upload unlawful, discriminatory, defamatory, infringing, malicious, or misleading content</li>
          <li>create, issue, alter, or present fraudulent certificates</li>
          <li>access, export, collect, or disclose recipient data without authorization</li>
          <li>interfere with the Service, its security, rate limits, App Check, or other users</li>
          <li>
            introduce malware, attempt unauthorized access, or test the Service for vulnerabilities
            without written permission
          </li>
          <li>send spam or unauthorized marketing</li>
          <li>use the Service for an unauthorized commercial purpose</li>
        </ul>

        <h2>10. Privacy</h2>
        <p>
          Our processing of personal information is described in the{" "}
          <Link href="/privacy">Privacy Policy</Link>. Organizers acknowledge that recipient
          information is not public through recipient lists, but a person who correctly supplies a
          lookup value may retrieve the corresponding certificate data.
        </p>
        <p>
          You must not upload information that you are not authorized to process. You remain
          responsible for communications and notices required between you and your recipients.
        </p>

        <h2>11. Third-party services</h2>
        <p>
          The Service relies on third-party services, including Google/Firebase, Google reCAPTCHA,
          Netlify, Cloudflare R2, and, when selected by an organizer, Google Sheets. Their
          availability, terms, and privacy practices are outside RSAMDIO’s direct control.
        </p>
        <p>
          Links to third-party services do not imply RSAMDIO endorsement. Use of a third-party
          service is subject to that provider’s terms and privacy policy.
        </p>

        <h2>12. Availability and changes</h2>
        <p>
          We aim to keep the Service available and reliable, but do not guarantee uninterrupted,
          error-free, secure, or permanent availability. Features, designs, activity pages,
          certificate availability, and organizer access may change or become unavailable.
        </p>
        <p>
          You should retain a local copy of a downloaded certificate. A closed activity may remain
          viewable but may no longer permit certificate lookup or download.
        </p>

        <h2>13. Disclaimers</h2>
        <p className="legal-callout">
          To the fullest extent permitted by law, the Service is provided “as is” and “as available.”
          RSAMDIO and ZeoSpec disclaim warranties that are not expressly stated in these Terms,
          including implied warranties of merchantability, fitness for a particular purpose,
          non-infringement, availability, accuracy, and security.
        </p>
        <p>
          Nothing in these Terms excludes a warranty, right, or liability that cannot lawfully be
          excluded or limited.
        </p>

        <h2>14. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, RSAMDIO, ZeoSpec, and their volunteers, officers,
          suppliers, and licensors will not be liable for indirect, incidental, special,
          consequential, punitive, or exemplary damages, or for loss of profits, data, goodwill,
          reputation, or business opportunity arising from or related to the Service.
        </p>
        <p>
          This limitation does not apply to liability that cannot be excluded or limited under
          applicable law.
        </p>

        <h2>15. Suspension and termination</h2>
        <p>
          We may suspend or terminate access, remove content, or restrict use if we reasonably
          believe that you have breached these Terms, created legal or security risk, misused
          recipient information, created fraudulent certificates, or endangered the Service or
          others.
        </p>
        <p>
          Termination does not remove obligations that by their nature should continue, including
          privacy, intellectual-property, acceptable-use, disclaimer, limitation-of-liability, and
          dispute provisions.
        </p>

        <h2>16. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of India, without regard to conflict-of-law
          principles.
        </p>
        <p>
          Subject to mandatory consumer or privacy rights that apply in your place of residence,
          courts with competent jurisdiction in India will have exclusive jurisdiction over disputes
          arising from these Terms or the Service.
        </p>

        <h2>17. Changes to these Terms</h2>
        <p>
          We may update these Terms to reflect changes to the Service, law, security requirements, or
          organizational practices. The updated Terms will be posted on this page with a revised
          “Last updated” date. Continued use after the effective date means you accept the updated
          Terms, except where applicable law requires another form of notice or consent.
        </p>

        <h2>18. Contact</h2>
        <div className="legal-contact">
          <p>
            <strong>Rotaract South Asia MDIO</strong>
            <br />
            Email: <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a>
          </p>
          <p>
            <strong>Technical support — ZeoSpec</strong>
            <br />
            Email: <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a>
          </p>
        </div>

        <h2>19. Severability and entire agreement</h2>
        <p>
          If a provision of these Terms is unenforceable, it will be enforced to the maximum extent
          permitted by law, and the remaining provisions will remain in effect.
        </p>
        <p>
          These Terms and the Privacy Policy are the entire agreement between you and RSAMDIO
          concerning your use of the Service, unless RSAMDIO has entered into a separate written
          agreement with you.
        </p>

        <p className="legal-closing">
          By using Rotaract Certify, you acknowledge that you have read, understood, and agree to be
          bound by these Terms and Conditions.
        </p>
      </article>
    </main>
  );
}
