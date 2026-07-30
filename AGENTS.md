# AGENTS.md — RSACertify

Working context for Rotaract Certify, the certificate platform for Rotaract South Asia MDIO (RSAMDIO).

## Platform

- Production: <https://certify.rsamdio.org>
- Web app: Next.js App Router in `src/app`, deployed on Netlify with `@netlify/plugin-nextjs`
- Firebase project: `rsacertify`
- Backend: Firestore, Realtime Database, Auth, and Node 22 Gen 1 Cloud Functions
- Firebase Functions region: `asia-southeast1` (`functions/src/runtime.ts`)

This is not a Jekyll or Decap CMS site. Do not restore legacy layouts, static HTML pages, or the old `admin-dashboard.js` approach.

## Architecture and data boundaries

- Firestore is the authoritative application store.
- RTDB supplies the public catalog and activity read models at `public/catalog` and `public/activities/{slug}`.
- Public certificate lookup calls `verifyCertificate`; recipient records are not publicly readable.
- The client initializes Functions with `getFunctions(app, "asia-southeast1")`.
- Certificate artwork is served from `cert.rsamdio.org`; the Functions code signs R2 uploads.
- Organizers authenticate with Firebase Google sign-in.

## Organizer workflow

The activity editor tab order is fixed:

**Details → Design → Recipients → Placement → Managers**

The forward controls follow **Design → Recipients → Placement → Managers**. New activities open on Design. Design keys must be lowercase letters, digits, hyphens, or underscores; use the UI hint `gold / silver / bronze`. Certificate fields live on Recipients (needed before Placement).

The public organizer guide is at `/playbook`. The footer’s Explore section does not link to Library or duplicate the playbook link; Rotaract Library remains a card under “More from RSAMDIO.”

## Security and integration requirements

- `verifyCertificate` accepts active activities only, has a durable Firestore rate limit, and enforces Firebase App Check.
- Initialize App Check locally and in Netlify with `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`. It is a public reCAPTCHA v3 site key, not a secret.
- `/api/sheet-csv` and `/api/sheet-sheets` only proxy public Google Sheets. There is no Netlify service account; CSV upload is the alternative.
- `src/middleware.ts` sets CSP with host allowlists (no per-request script nonces — those break ISR/cached HTML on Netlify). Development adds `unsafe-eval` for HMR. `connect-src` includes `wss://*.firebasedatabase.app` for RTDB. `frame-src` permits `*.firebaseapp.com`; COOP is `same-origin-allow-popups` for Firebase Google popup sign-in.
- Do not duplicate the dynamic CSP in `netlify.toml`.

## Key files

| Concern | Location |
| --- | --- |
| Public catalog and activity page | `src/app/page.tsx`, `src/app/[slug]/` |
| Admin activity editor | `src/app/admin/activities/[slug]/ActivityEditorClient.tsx` |
| Firebase client and App Check | `src/lib/firebase-client.ts` |
| Callable functions | `functions/src/participants.ts`, `functions/src/claims.ts`, `functions/src/read-model-sync.ts` |
| Function region | `functions/src/runtime.ts` |
| Firebase access rules | `firestore.rules`, `database.rules.json`, `storage.rules` |
| CSP and request headers | `src/middleware.ts`, `netlify.toml` |
| Launch procedure | `docs/LAUNCH_CHECKLIST.md` |
| Organizer access model | `docs/ACCESS_MODEL.md` |

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build

cd functions && npm install && npm run build
firebase deploy --only functions,firestore,database,storage
```

Netlify builds the site with `npm run build`; its Next.js plugin and site redirect/header policy are configured in `netlify.toml`.
