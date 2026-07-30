[![Netlify Status](https://api.netlify.com/api/v1/badges/f98e6058-1e09-46de-8f9d-49a03b6287f7/deploy-status)](https://app.netlify.com/projects/rsacertify/deploys)

# Rotaract Certify

Digital certificate issuing and lookup for [Rotaract South Asia MDIO](https://rsamdio.org/).

- Production: <https://certify.rsamdio.org>
- Web: Next.js App Router on Netlify (`@netlify/plugin-nextjs`)
- Backend: Firebase project `rsacertify` — Firestore, RTDB, Auth, and Node 22 Functions in `asia-southeast1`

## Develop locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app runs at <http://localhost:3000>. Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in `.env.local` so Firebase App Check can attach tokens to public certificate lookups.

To build the backend:

```bash
cd functions
npm install
npm run build
```

## Verify and deploy

```bash
npm run typecheck
npm run build

firebase deploy --only functions,firestore,database,storage
```

Netlify runs `npm run build` for the Next.js app according to `netlify.toml`. Firebase Functions and the web client both use `asia-southeast1`.

`verifyCertificate` requires Firebase App Check and applies a durable rate limit. Public pages use RTDB read models, while recipient data remains private. Google Sheets imports only support public sheets; organizers can upload CSV files instead.

Activity descriptions use TipTap in admin and are sanitized with `sanitize-html` for public SSR (avoid jsdom-based sanitizers on Netlify).

## Docs

| Doc | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent / contributor working context |
| [DESIGN.md](DESIGN.md) | Public + admin UX binding rules |
| [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) | Production configuration and pilot checks |
| [docs/ACCESS_MODEL.md](docs/ACCESS_MODEL.md) | Organizer roles, invites, dual membership |
| [docs/ACCESS_VERIFY.md](docs/ACCESS_VERIFY.md) | Access promote/demote test matrix |
| [Organizer playbook](https://certify.rsamdio.org/playbook) | Create → publish workflow for organizers |
