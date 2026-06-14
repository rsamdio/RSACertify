# AGENTS.md — RSACertify (Rotaract Certify)

Persistent context for AI agents and developers working on this repository.

## What this project is

**Rotaract Certify** is a digital certificate platform for **Rotaract South Asia MDIO (RSAMDIO)**. Participants look up and download PDF certificates for events; admins manage events, participants, and certificate templates.

- **Production URL:** https://certify.rsamdio.org
- **Firebase project:** `rsacertify`
- **RTDB region:** `asia-southeast1`
- **Site deploy:** Netlify (Jekyll static build → `_site/`)
- **Backend deploy:** Firebase (Firestore rules, RTDB rules, Cloud Functions, Storage rules)

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Netlify (Jekyll static site)                                   │
│  index.html, _events/*.md, _layouts/, assets/                   │
└───────────────┬─────────────────────────────────────────────────┘
                │ Firebase SDK (compat v12.9)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firebase                                                       │
│  • Firestore — source of truth (events, participants, admins)   │
│  • RTDB — denormalized cache/index (lists, search, counters)    │
│  • Cloud Functions (Node 22, Gen 1) — callables + sync triggers │
│  • Storage — CSV exports                                        │
│  • Auth — Google OAuth (admins only)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Dual content model (important)

Events exist in **two places** that must stay aligned:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Public pages** | Jekyll `_events/*.md` | SEO, layout, certificate template config, participant field positions |
| **Operational data** | Firestore `events/{id}` + subcollections | Live counters, admin CRUD, participant records |

Each event markdown file should include `firestore_document_id` matching the Firestore event doc ID created in the admin dashboard.

### Two admin surfaces

| Path | Tool | Purpose |
|------|------|---------|
| `/admin/` | Decap CMS (`admin/config.yml`) | Edit `_events/` markdown, upload certificate PNG templates |
| `/admin/participants.html` | Custom Firebase dashboard | Events, participants, bulk CSV, admins, analytics |

Do not confuse these when making changes.

---

## Repository map

```
RSACertify/
├── _config.yml              # Jekyll site config, events collection
├── _events/                 # Event markdown (Jekyll collection → public pages)
├── _layouts/
│   ├── default.html         # Base layout, CSP, Firebase script loading
│   └── event.html           # Certificate lookup UI + #event-config JSON
├── _includes/footer.html
├── assets/
│   ├── css/style.css        # Global design system
│   ├── js/
│   │   ├── firebase-config.js      # Public Firebase init (keep in sync with admin)
│   │   ├── main.js                 # CertificateManager — public cert search
│   │   ├── certificate-generator.js # jsPDF + canvas certificate rendering
│   │   ├── security-utils.js       # Validation, rate limits, XSS helpers
│   │   └── analytics-utils.js
│   ├── images/
│   └── templates/           # Certificate PNG templates
├── admin/
│   ├── index.html           # Decap CMS entry
│   ├── config.yml           # Decap CMS schema for _events/
│   ├── participants.html    # Firebase admin dashboard shell
│   ├── admin-dashboard.js   # ~110k monolith — main admin orchestration
│   └── js/participants-manager.js  # Reusable manager classes
├── functions/               # Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── index.ts         # Counter triggers + re-exports
│       ├── admin.ts         # Lazy firebase-admin init (hardcoded RTDB URL)
│       ├── auth.ts          # verifyAdmin()
│       ├── cache.ts         # In-memory NodeCache (admin, stats, config)
│       ├── participants.ts  # searchParticipants, bulkUpload, verifyCertificate
│       ├── events.ts        # getEventStatistics, getEventConfig, migrateCounters
│       ├── exports.ts       # exportParticipantsCSV
│       └── realtime-sync.ts # Firestore → RTDB sync triggers
├── firebase.json            # Functions runtime nodejs22, rules paths
├── firestore.rules
├── database.rules.json
├── storage.rules
├── netlify.toml             # Build, CSP, security headers, redirects
├── index.html               # Homepage + client-side event filter
├── privacy.html, terms.html
└── robots.txt
```

**Build output:** `_site/` (gitignored from processing; do not edit directly)

**Excluded from Jekyll build:** `functions/`, `node_modules/`, `vendor/`

---

## Key user flows

### Public certificate retrieval

1. User opens event page (`/_events/` → `/:slug/` via Jekyll).
2. `#event-config` JSON injects `template`, `participantFields`, `firestoreDocumentId`.
3. User submits email or redeem code on `#certificateForm`.
4. `CertificateManager.searchParticipant()` (`assets/js/main.js`):
   - Validates via `SecurityUtils`
   - Rate-limits (10 attempts / 60s)
   - Calls **`verifyCertificate`** Cloud Function (no direct Firestore participant reads)
5. On match: show `#certificateFound`; download triggers `CertificateGenerator` (canvas → jsPDF).
6. Post-download: `certificateStatus: 'downloaded'` written to Firestore (admin-only rules; may fail silently on client).

**Do not re-enable direct Firestore participant queries from the public site.** Firestore rules block public participant reads by design.

### Homepage event browse

`index.html` filters Jekyll-rendered `.event-card-wrapper` elements client-side. This is **not** a Firebase search.

### Admin dashboard

1. Google sign-in → check `admins/{uid}` in Firestore (or auto-promote from `invites/{email}`).
2. Three tabs: Events, Participants, Admins.
3. Data loading prefers RTDB cache, falls back to Firestore:
   - Events: `events/list` → Firestore `events`
   - Participants: IndexedDB → RTDB `participants/index` → paginated Firestore
4. Bulk upload: callable `bulkUploadParticipants` with RTDB progress at `bulkUploads/{uid}/progress`.

---

## Data model

### Firestore (source of truth)

| Collection | Key fields |
|------------|------------|
| `events/{eventId}` | `title`, `date`, `participantFields[]`, `participantsCount`, `certificatesCount` |
| `events/{eventId}/participants/{id}` | `name`, `email` (email **or** redeem code, lowercase), `certificateStatus`, `additionalFields`, timestamps |
| `admins/{uid}` | `email`, `createdAt` |
| `invites/{email}` | invite records for admin onboarding |

### Realtime Database (cache — written only by Cloud Functions)

| Path | Purpose |
|------|---------|
| `events/list` | Denormalized event summaries for admin |
| `events/{id}/meta` | Event metadata |
| `events/{id}/counters` | Live participant/certificate counts |
| `events/{id}/participants/index/{id}` | Participant rows for admin table |
| `events/{id}/search/{id}` | Search index (email/searchText) — **not used by public flow** |
| `admins/list`, `invites/list` | Admin dashboard dropdowns |
| `bulkUploads/{uid}/progress` | Bulk upload progress |

### Jekyll event front matter

See `_events/2025-09-04-TesTEent.md` for the canonical shape: `title`, `slug`, `status`, `date`, `template`, `firestore_document_id`, `participantFields[]`.

---

## Cloud Functions catalog

All functions use **firebase-functions v1** (Gen 1). Entry: `functions/src/index.ts`.

### Firestore triggers — counters (`index.ts`)

- `onParticipantCreate` / `onParticipantDelete` — increment/decrement `participantsCount`
- `onCertificateDownload` — adjust `certificatesCount` when status → `'downloaded'`
- `syncCountersToRealtime` — mirror counters to RTDB

### Firestore triggers — RTDB sync (`realtime-sync.ts`)

- `syncEventMetadataToRealtime`, `syncEventsListToRealtime`
- `syncAdminsToRealtime`, `syncInvitesToRealtime`
- `syncParticipantIndexToRealtime`, `syncParticipantSearchIndex`

### HTTPS callables

| Function | Auth | Purpose |
|----------|------|---------|
| `verifyCertificate` | Public | Lookup by eventId + email/redeem code |
| `searchParticipants` | Admin | Firestore prefix search on `name` |
| `bulkUploadParticipants` | Admin | Batch write up to 5000 participants |
| `getEventStatistics` | Admin | Cached stats from event doc counters |
| `getEventConfig` | Admin | Cached full event document |
| `migrateCounters` | Admin | Reconcile counters by scanning participants |
| `exportParticipantsCSV` | Admin | CSV to Storage, returns signed URL |

Admin callables use `verifyAdmin()` — checks Firestore `admins/{uid}` with 2-minute in-memory cache.

---

## Security model

### Firestore rules (`firestore.rules`)

- Events: public read; admin write
- Participants: **admin only** (read/write/create/delete)
- Admins: self-read/create; admins manage others
- Invites: admin manage; users read own invite

### RTDB rules (`database.rules.json`)

- Most paths: authenticated read, Cloud Functions write only
- `events/{id}/search`: **no public read** — use `verifyCertificate` callable
- `events/{id}/counters`: public read (for display)

### Client security (`assets/js/security-utils.js`)

- Input sanitization, email/redeem validation, rate limiting
- `validateAdminEmail()` restricts to `rsamdio.org`, `rotaract.org`, `rotary.org`
- CSP defined in `_layouts/default.html` and mirrored in `netlify.toml`

### Firebase config duplication

Config lives in **two places** — keep them in sync:

- `assets/js/firebase-config.js` (public site)
- `admin/admin-dashboard.js` lines 2–29 (admin dashboard)

---

## Development & deployment

### Local site

```bash
bundle install
bundle exec jekyll serve   # http://localhost:4000
```

Ruby 3.3.6 per `netlify.toml`. Jekyll plugins: feed, seo-tag, sitemap, paginate.

### Cloud Functions

```bash
cd functions && npm install
npm run build

# From repo root — use Node 20+ for Firebase CLI
export NODE_OPTIONS="--max-old-space-size=4096"
export FUNCTIONS_DISCOVERY_TIMEOUT=120
firebase use rsacertify
firebase deploy --only functions --force
```

Runtime: **Node 22** (`functions/package.json`, `firebase.json`).

Deploy rules separately:

```bash
firebase deploy --only firestore,database,storage
```

### Netlify

- Build: `bundle exec jekyll build --config _config.yml`
- Publish: `_site`
- Redirects `rsacertify.netlify.app` → `certify.rsamdio.org`

---

## Conventions & coding guidelines

### When changing certificate behavior

Touch **both** sides together:

- Public: `assets/js/main.js`, `_layouts/event.html`, `assets/js/certificate-generator.js`
- Backend: `functions/src/participants.ts` (`verifyCertificate`)
- Optionally: Firestore/RTDB rules if access patterns change

### When changing event templates

- PNG templates: `assets/templates/` (Decap CMS media folder)
- Field positioning: `_events/*.md` front matter **and/or** Firestore `participantFields` on event doc
- Decap schema: `admin/config.yml`

### When changing admin features

- Primary logic: `admin/admin-dashboard.js` (large monolith — prefer surgical edits)
- Reusable classes: `admin/js/participants-manager.js`
- UI shell: `admin/participants.html`

### TypeScript (functions)

- Strict mode enabled; no unused locals
- Lazy `firebase-admin` init in `admin.ts` (required for deploy discovery)
- `src/scripts/` excluded from build (CLI migration scripts only)
- Use exhaustive switch with `never` check for union types

### Imports

- Keep imports at top of file (no inline imports unless documented circular-dep reason)

### Minimize scope

- Match existing patterns (compat Firebase SDK on frontend, v1 functions on backend)
- Do not refactor unrelated code in the same change
- `_site/` is generated — never edit directly

---

## Known gotchas & tech debt

1. **Triple/quadruple triggers** — Each event or participant write fires multiple Cloud Functions. Adding fields increases cost.

2. **Counter drift** — Counter trigger errors are swallowed (logged, not rethrown). Use `migrateCounters` callable to repair.

3. **RTDB list sync is read-modify-write** — Concurrent writes to `events/list`, `admins/list` can race.

4. **In-memory caches** — Admin verification (2 min), stats (5 min), event config (10 min) can be stale; no invalidation on data change.

5. **`email` field dual semantics** — Stores email OR redeem code, always lowercase. Changing normalization breaks existing records.

6. **RTDB search index unused by admin callable** — `searchParticipants` queries Firestore by name prefix, not RTDB `search/`.

7. **Hardcoded RTDB URL** — `functions/src/admin.ts` and client configs; no env-based config.

8. **Firebase config duplicated** — Public and admin init must be updated together.

9. **admin-dashboard.js size** — ~110k lines in one file; high merge conflict risk.

10. **Public download status update** — Client writes `certificateStatus` after download; Firestore rules require admin — update may fail silently; counters rely on Cloud Function `onCertificateDownload` when admin path succeeds.

11. **Functions region** — No explicit region in code (defaults to `us-central1`); RTDB is `asia-southeast1` (cross-region latency possible).

---

## Decision guide: where to change what

| Task | Files |
|------|-------|
| Homepage layout / event cards | `index.html` |
| Event page UI / cert form | `_layouts/event.html` |
| Public cert search logic | `assets/js/main.js`, `functions/src/participants.ts` |
| PDF rendering | `assets/js/certificate-generator.js`, event `participantFields` |
| Add/edit event content (CMS) | `_events/*.md`, `admin/config.yml` |
| Admin participant CRUD | `admin/admin-dashboard.js`, `admin/participants.html` |
| Bulk CSV upload | `admin-dashboard.js`, `functions/src/participants.ts` |
| Event/participant counters | `functions/src/index.ts`, `functions/src/events.ts` |
| RTDB sync behavior | `functions/src/realtime-sync.ts` |
| Access control | `firestore.rules`, `database.rules.json`, `functions/src/auth.ts` |
| CSP / security headers | `netlify.toml`, `_layouts/default.html` |
| SEO / sitemap | `_config.yml`, `robots.txt`, Jekyll front matter |
| Deploy config | `netlify.toml`, `firebase.json`, `.firebaserc` |

---

## Testing checklist (manual)

- [ ] `bundle exec jekyll build` succeeds
- [ ] `cd functions && npm run build` succeeds (strict TS)
- [ ] Public event page: search with valid email/redeem code returns certificate
- [ ] Public event page: invalid input shows error; rate limit works
- [ ] Certificate PDF downloads with correct field placement
- [ ] Admin sign-in with Google; non-admin blocked
- [ ] Admin: create event, add participant, bulk CSV upload
- [ ] Admin: export CSV, counters reconcile
- [ ] Decap CMS loads at `/admin/` (requires Netlify Identity in production)

---

## External references

- README.md — setup, deployment, data model details
- Firebase Console: project `rsacertify`
- Netlify: project `rsacertify`
- Support: ZeoSpec (contact@zeospec.com), RSAMDIO (rsamdio@gmail.com)
