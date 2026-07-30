import { JsonLd } from "@/components/JsonLd";

const FAQS = [
  {
    q: "What is Rotaract Certify?",
    a: "Rotaract Certify is the digital certificate platform by Rotaract South Asia MDIO (RSAMDIO). Organizers publish activities; participants look up and download verified PDF certificates."
  },
  {
    q: "How do I download my certificate?",
    a: "Open your activity page from the catalog or a link your organizers shared. Enter the email or redeem code they gave you, then download the PDF when your certificate is found."
  },
  {
    q: "What if my email or code is not found?",
    a: "Check spelling carefully (including O versus 0 in codes). Use the exact value from registration. If it still fails, contact your activity organizers, they manage the recipient list."
  },
  {
    q: "Who can create and manage activities?",
    a: "Invited organizers, platform admins and activity managers can sign in to the admin workspace and manage the activities. Public visitors only look up their own certificates."
  },
  {
    q: "Are participant lists public?",
    a: "No. Names, emails, and redeem codes are not listed on the public site. Lookup requires an exact match and returns only your own certificate details."
  },
  {
    q: "Who operates Rotaract Certify?",
    a: "Rotaract South Asia MDIO (RSAMDIO). For platform support, contact rsamdio@gmail.com."
  }
] as const;

export async function HomeFaq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };

  return (
    <section className="section home-faq" aria-labelledby="faq-heading">
      <JsonLd data={jsonLd} />
      <h2 id="faq-heading">Frequently asked questions</h2>
      <p className="meta">Quick answers about finding and downloading your certificate.</p>
      <div className="faq-list">
        {FAQS.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
