import Link from "next/link";
import type { Metadata } from "next";
import { BrandMasthead } from "@/components/BrandMasthead";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Rotaract Certify — how Rotaract South Asia MDIO collects, uses, and protects your information.",
  openGraph: {
    title: "Privacy Policy | Rotaract Certify | Rotaract South Asia MDIO"
  }
};

export default function PrivacyPage() {
  return (
    <main className="container legal-page">
      <BrandMasthead compact lead="How we protect your data on Rotaract Certify." />

      <p className="activity-back">
        <Link href="/">← Back to Rotaract Certify</Link>
        {" · "}
        <Link href="/terms">Terms and Conditions</Link>
      </p>

      <section className="card activity-hero rise">
        <div className="activity-hero-meta">
          <time dateTime="2026-07-29">Last updated 29 July 2026</time>
        </div>
        <h1 className="activity-hero-title">Privacy Policy</h1>
        <p className="activity-hero-lead">
          How Rotaract South Asia MDIO handles personal information when you use Rotaract Certify.
        </p>
      </section>

      <article className="card legal-content">
        <h2>1. About this Privacy Policy</h2>
        <p>
          This Privacy Policy explains how Rotaract South Asia MDIO (“RSAMDIO”, “we”, “us”, or “our”)
          handles personal information in Rotaract Certify, available at{" "}
          <a href="https://certify.rsamdio.org">https://certify.rsamdio.org</a> (the “Service”).
        </p>
        <p>
          Rotaract Certify helps Rotaract organizers create activities, manage participant records,
          and make digital certificates available for download. ZeoSpec develops and supports the
          platform for RSAMDIO.
        </p>
        <p>
          This Policy applies to public visitors, certificate recipients, and invited organizers or
          managers who use the Service. It does not replace the privacy notice of an individual
          Rotaract club, event organizer, or other organization that collected your information for
          an activity.
        </p>

        <h2>2. Who is responsible for information</h2>
        <p>
          RSAMDIO operates the Service. For a particular activity, the organizer that decides which
          participant information to collect, why to collect it, and how to use it will generally be
          responsible for that activity’s participant information. RSAMDIO and ZeoSpec may process
          that information to operate, secure, support, and improve the Service.
        </p>
        <p>
          Organizers must ensure they have the authority required to upload and use participant
          information.
        </p>

        <h2>3. Information we process</h2>
        <h3>3.1 Public visitors and certificate recipients</h3>
        <p>When you visit the public catalog or an activity page, we may process:</p>
        <ul>
          <li>
            activity information published by organizers, such as title, description, date,
            certificate design, and field labels
          </li>
          <li>
            technical and usage information such as browser type, approximate device details, IP
            address, pages or features used, and event timestamps
          </li>
          <li>the email address, redeem code, or other lookup value you submit to find a certificate</li>
          <li>
            certificate data returned for a successful lookup, including participant name, lookup
            value, certificate status, download status, and activity-specific certificate fields
          </li>
          <li>information relating to download attempts and when a certificate is marked downloaded</li>
        </ul>
        <p className="legal-callout">
          The PDF is generated in your browser from the certificate design and data returned for
          your lookup. We do not need to store the generated PDF merely because you download it.
        </p>

        <h3>3.2 Organizers and managers</h3>
        <p>If you are invited to the organizer workspace, we may process:</p>
        <ul>
          <li>
            Google account information made available through Google sign-in (such as name, email,
            account identifier, and profile image where available)
          </li>
          <li>your role and access scope (platform administrator or activity manager)</li>
          <li>
            activity details, certificate designs, placement settings, field schemas, participant
            records, imports, exports, and manager invitations
          </li>
          <li>support communications and operational records</li>
          <li>actions taken in the organizer workspace where needed for security or administration</li>
        </ul>

        <h3>3.3 Participant information uploaded by organizers</h3>
        <p>
          Organizers may upload participant information such as names, email addresses, redeem codes,
          selected certificate design, certificate status, and custom fields configured for an
          activity. Custom fields are chosen by organizers and may appear on a certificate or be
          retained only as an activity record.
        </p>
        <p>
          Organizers must not use the Service for sensitive personal information unless RSAMDIO has
          expressly approved that use and the organizer has an appropriate legal basis and
          safeguards.
        </p>

        <h2>4. How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>display the public catalog and activity pages</li>
          <li>authenticate invited organizers and enforce role-based access</li>
          <li>create, manage, issue, retrieve, and support certificates</li>
          <li>process certificate lookup requests and reduce unauthorized guessing or abuse</li>
          <li>enable browser-based certificate generation and record download status</li>
          <li>operate CSV and public Google Sheets imports selected by organizers</li>
          <li>host and deliver certificate-design assets</li>
          <li>maintain records, resolve errors, provide support, and protect the Service</li>
          <li>understand aggregate product use and improve reliability</li>
          <li>comply with legal obligations and protect RSAMDIO, users, and the Service</li>
        </ul>

        <h2>5. Certificate lookup, security, and access limits</h2>
        <p>
          Public visitors can browse activity information, but participant lists are not publicly
          browseable.
        </p>
        <p>
          To retrieve a certificate, you submit an activity-specific lookup value (such as an email
          address or redeem code). The lookup is handled by a secure backend check (
          <code>verifyCertificate</code>) rather than by public access to participant records. A
          successful match returns the minimum certificate data needed to display one certificate.
        </p>
        <p className="legal-callout">
          This is not the same as identity verification. Anyone who knows or can correctly guess a
          valid lookup value may be able to retrieve that certificate. Do not share redeem codes or
          other lookup values unnecessarily. Organizers should use sufficiently unpredictable codes
          where email lookup is unsuitable.
        </p>
        <p>
          The lookup service uses Firebase App Check with Google reCAPTCHA v3 and durable rate
          limiting to reduce automated abuse. These controls reduce risk but cannot guarantee that
          unauthorized access, attacks, or errors will never occur.
        </p>

        <h2>6. Service providers and data locations</h2>
        <p>We use service providers to operate the Service, including:</p>
        <ul>
          <li>
            <strong>Firebase / Google Cloud:</strong> Authentication, Firestore, Realtime Database,
            Cloud Functions, App Check, and Analytics. Realtime Database and Cloud Functions are
            configured for the <code>asia-southeast1</code> region. Other Google processing may occur
            in locations selected or operated by Google.
          </li>
          <li>
            <strong>Google reCAPTCHA:</strong> reCAPTCHA v3 supports App Check for certificate lookup
            abuse prevention.
          </li>
          <li>
            <strong>Netlify:</strong> hosting and delivery of the website and related server routes.
          </li>
          <li>
            <strong>Cloudflare R2:</strong> storage and public delivery of organizer-uploaded
            certificate design images through <code>cert.rsamdio.org</code>.
          </li>
          <li>
            <strong>Google Sheets:</strong> when an organizer pastes a public Google Sheets URL, the
            Service may read that public sheet for import. Google’s own terms and privacy practices
            also apply.
          </li>
          <li>
            <strong>ZeoSpec:</strong> platform development, technical support, security, and
            operational assistance for RSAMDIO.
          </li>
        </ul>
        <p className="legal-callout">
          We do not sell personal information or use it for third-party advertising. We may disclose
          information to these providers, to authorized organizers for their activities, where
          required by law, or where reasonably necessary to prevent fraud, abuse, or harm.
        </p>

        <h2>7. Analytics, cookies, and similar technologies</h2>
        <p>
          If Firebase Analytics is configured for the Service, it may collect information about use
          of the public catalog and activity pages, including events such as catalog views, activity
          opens, certificate lookup outcomes, and download outcomes. These events are intended to
          measure Service use and reliability. Organizers should not place participant names, email
          addresses, redeem codes, or other personal information into analytics fields.
        </p>
        <p>
          Google and Firebase may use cookies, local storage, device identifiers, or similar
          technologies to provide analytics, authentication, App Check, security, and service
          functionality.
        </p>
        <p>
          You can control cookies through browser settings. Blocking necessary technologies may
          limit sign-in, security checks, or other features. Where applicable law requires consent
          before non-essential technologies are used, RSAMDIO will provide an appropriate notice or
          consent mechanism.
        </p>

        <h2>8. Google Sheets and uploaded designs</h2>
        <p>
          A Google Sheet import works only for a sheet shared as “Anyone with the link.” That sharing
          choice can make the sheet accessible to people who receive the link, outside Rotaract
          Certify. Before using this import option, organizers must confirm that public-link sharing
          is appropriate. Organizers may instead export a CSV and upload it locally.
        </p>
        <p>
          Certificate designs are uploaded to Cloudflare R2 and delivered from{" "}
          <code>cert.rsamdio.org</code> so certificates can be rendered in browsers. Organizers must
          not embed personal information, confidential material, or content they lack rights to use
          in a design image.
        </p>

        <h2>9. Retention</h2>
        <p>
          We retain information for as long as reasonably necessary to operate the Service, support
          certificate issuance and verification, meet legal or organizational recordkeeping needs,
          resolve disputes, and protect the Service.
        </p>
        <ul>
          <li>
            Activity and participant records may be retained while an activity remains available and
            afterward where historical certificate records are needed
          </li>
          <li>
            Organizer accounts and access records may be retained until access is removed and for an
            appropriate security or audit period
          </li>
          <li>
            Security and rate-limit records are retained for the period needed to prevent abuse and
            maintain system integrity
          </li>
        </ul>
        <p>
          Retention periods may vary by activity and applicable law. RSAMDIO or the relevant
          organizer may delete or correct records where appropriate, subject to legitimate
          recordkeeping, legal, security, and fraud-prevention needs.
        </p>

        <h2>10. Your choices and rights</h2>
        <p>
          Depending on where you live and applicable law, you may have rights to request access to,
          correction of, deletion of, restriction of, objection to, or a copy of personal
          information. You may also have rights to withdraw consent where processing is based on
          consent.
        </p>
        <p>
          For information in a specific activity, contact that activity’s organizer first. They are
          best placed to correct participant details or update a certificate record. You may also
          contact RSAMDIO or ZeoSpec using the details below.
        </p>
        <p>
          We may need to verify your identity and authority before responding. Rights are not
          absolute and may be limited by applicable law, security needs, the rights of others, or
          legitimate recordkeeping requirements.
        </p>

        <h2>11. International processing</h2>
        <p>
          Rotaract Certify serves a South Asian Rotaract community and uses providers that may
          process information in India, Singapore, the United States, and other countries where they
          or their subprocessors operate. Data-protection laws in those countries may differ from the
          laws where you live.
        </p>

        <h2>12. Children and young people</h2>
        <p>
          The Service is not designed for children to use independently. Activities may involve young
          people, and organizers are responsible for ensuring that collection and use of participant
          information complies with applicable age, consent, safeguarding, and parental-authority
          requirements.
        </p>
        <p>
          If you believe information about a child or young person was uploaded or used improperly,
          contact the relevant organizer and RSAMDIO promptly.
        </p>

        <h2>13. Changes to this Policy</h2>
        <p>
          We may update this Policy to reflect changes to the Service, law, or our data practices. We
          will post the revised Policy on this page and update the “Last updated” date. Where
          required by law, we will provide additional notice or obtain consent.
        </p>

        <h2>14. Contact us</h2>
        <div className="legal-contact">
          <p>
            <strong>Rotaract South Asia MDIO</strong>
            <br />
            Email: <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a>
          </p>
          <p>
            <strong>Privacy and product support — ZeoSpec</strong>
            <br />
            Email: <a href="mailto:rsamdio@gmail.com">rsamdio@gmail.com</a>
          </p>
          <p className="meta">
            Please do not send sensitive information in an unencrypted email unless necessary.
            Include the relevant activity name and enough information for us to identify the request
            without unnecessarily disclosing further personal information.
          </p>
        </div>

        <h2>15. Additional notices for certain regions</h2>
        <h3>15.1 European Economic Area / United Kingdom</h3>
        <p>
          If you are in the EEA or UK, you may have rights under applicable data-protection law,
          including rights to access, update, delete, rectify, object, restrict processing, receive
          portable data, and withdraw consent where processing is based on consent. Contact us using
          the details above to exercise these rights.
        </p>
        <h3>15.2 California</h3>
        <p>If you are a California resident, you may have the right to:</p>
        <ul>
          <li>know what personal information is collected, used, or shared</li>
          <li>request deletion of personal information</li>
          <li>opt out of the sale of personal information (we do not sell personal information)</li>
          <li>not be discriminated against for exercising privacy rights</li>
        </ul>

        <h2>16. Certificate-specific privacy notes</h2>
        <ul>
          <li>
            <strong>Sharing certificates:</strong> people may share downloaded certificates; share
            carefully
          </li>
          <li>
            <strong>Organizer responsibility:</strong> organizers should have a lawful basis before
            uploading people’s details
          </li>
          <li>
            <strong>Data minimization:</strong> only include details needed for the certificate or
            activity record
          </li>
          <li>
            <strong>Lookups:</strong> email and redeem codes are used to find the right certificate
            and are not a public directory
          </li>
          <li>
            <strong>Download status:</strong> may be recorded to understand issuance and support
          </li>
          <li>
            <strong>Organizer access:</strong> only authorized organizers manage participant lists
          </li>
        </ul>

        <p className="legal-closing">
          By using Rotaract Certify, you acknowledge that you have read and understood this Privacy
          Policy and agree to the collection and use of information as described here.
        </p>
      </article>
    </main>
  );
}
