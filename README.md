[![Netlify Status](https://api.netlify.com/api/v1/badges/f98e6928-1e09-46de-8f9d-49a03b6287f7/deploy-status)](https://app.netlify.com/projects/rsacertify/deploys)

# Rotaract Certify - Digital Certificate Generation Platform

A comprehensive Jekyll-based static website with **Firebase** integration for digital certificate generation, management, and distribution. Built for **Rotaract South Asia MDIO (RSAMDIO)** to enable Rotaractors to celebrate and showcase their contributions and achievements.

## 🚀 Key Features

### **For Participants**
- **Certificate Retrieval**: Search and download certificates using email addresses or redeem codes
- **Public Access**: No registration required for certificate retrieval
- **Mobile-Friendly**: Responsive design optimized for all devices
- **Secure Downloads**: PDF certificates with proper validation

### **For Administrators**
- **Event Management**: Create and manage multiple events with custom configurations
- **Participant Management**: Bulk upload participants via CSV or manual entry
- **Certificate Generation**: Dynamic PDF generation with customizable templates
- **Admin Authentication**: Secure Google OAuth-based authentication
- **Analytics Dashboard**: Track certificate downloads and participant engagement
- **CSV Import/Export**: Full participant data management with proper quote handling

### **Technical Features**
- **Dynamic Templates**: Customizable certificate templates with field positioning
- **Firebase Integration**: Real-time data synchronization and secure storage
- **Security First**: Comprehensive input validation, rate limiting, and XSS protection
- **SEO Optimized**: Built-in SEO features with structured data
- **Performance Optimized**: Static site generation with CDN-ready assets

## 🛠️ Tech Stack

- **Frontend**: Jekyll (static site), Bootstrap 5, Font Awesome 6
- **Backend**: Firebase
  - **Authentication** (Google OAuth for admins)
  - **Firestore** (source of truth: events, participants, admins, invites)
  - **Realtime Database** (cache/index for fast reads: event list, participant index, public search)
  - **Cloud Functions** (Node.js 22): counters, Firestore→RTDB sync, callables (stats, search, bulk upload, CSV export)
  - **Cloud Storage** (CSV export files)
- **PDF**: jsPDF + Canvas API (client-side certificate generation)
- **Security**: Input validation, CSP, admin checks via Firestore `admins` collection
- **Deployment**: Netlify (site), Firebase (rules + functions)

## 📋 Prerequisites

- **Ruby** 2.6.5+ and Bundler (Jekyll site)
- **Node.js 20** (for Firebase CLI and deploying Cloud Functions; use `nvm use 20`)
- **Firebase project** with Firestore, Realtime Database, Storage, and Authentication (Google provider) enabled
- **Admin access**: at least one user document in Firestore `admins/{uid}` (created when you first grant admin access via the app or manually)

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RSACertify
```

### 2. Install Dependencies

```bash
# Install Ruby gems
bundle install
```

### 3. Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Google provider), **Firestore**, **Realtime Database**, and **Storage**.
3. Copy `.firebaserc` or set the active project: `firebase use your-project-id`.
4. Update `assets/js/firebase-config.js` and `admin/admin-dashboard.js` with your config (include `databaseURL` for Realtime Database):

```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "your-app-id",
    measurementId: "G-XXXX",
    databaseURL: "https://your-project-id-default-rtdb.<region>.firebasedatabase.app"
};
```

### 4. Admin Access

Admins are stored in Firestore `admins/{uid}` (and synced to Realtime Database for the dashboard). Add your first admin document (e.g. via Firebase Console or your app’s admin flow). Optional: restrict allowed domains in `assets/js/security-utils.js` for an extra client-side check.

### 5. Security Rules

- **Firestore** (`firestore.rules`): Restrict writes to authenticated admins; allow public read only where needed (e.g. event metadata for public pages). Participant data is read by callables/server or via guarded client logic.
- **Realtime Database** (`database.rules.json`): Public read for search index and event list where required; admin-only for participant index and other sensitive paths. Deploy with `firebase deploy --only database,firestore`.

### 6. Deploy Firebase Cloud Functions (optional)

From the project root, deploy all Cloud Functions:

```bash
# Avoid discovery timeout and heap OOM during deploy
export NODE_OPTIONS="--max-old-space-size=4096"
export FUNCTIONS_DISCOVERY_TIMEOUT=120
firebase use rsacertify
firebase deploy --only functions --force
```

Use Node 20 for the Firebase CLI (`nvm use 20`). The codebase is optimized for deploy: **firebase-admin** is lazy-loaded (so discovery uses less memory), **scripts** are excluded from the bundle, and unused cache code was removed. If you still hit OOM, increase `--max-old-space-size` (e.g. 8192).

### 7. Run the Development Server

```bash
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`

## 📁 Project Structure

```
RSACertify/
├── _events/               # Event pages (Jekyll collection; front matter → event config)
├── _layouts/              # default, event
├── _includes/             # footer, nav
├── assets/
│   ├── css/
│   ├── js/
│   │   ├── main.js           # Certificate search (RTDB index + 1 Firestore doc read)
│   │   ├── firebase-config.js
│   │   ├── certificate-generator.js
│   │   └── security-utils.js
│   ├── images/
│   └── templates/            # Certificate templates (PNG)
├── admin/                 # Admin dashboard (participants, events, CSV export)
│   ├── index.html
│   ├── config.yml
│   └── participants.html
├── functions/             # Firebase Cloud Functions (TypeScript)
│   ├── src/
│   │   ├── index.ts       # Counters + counter→RTDB sync
│   │   ├── admin.ts       # Lazy Firebase Admin init
│   │   ├── auth.ts        # Admin verification (cached)
│   │   ├── cache.ts       # In-memory cache (stats, event config, admin)
│   │   ├── events.ts      # getEventStatistics, getEventConfig, migrateCounters
│   │   ├── participants.ts # searchParticipants, bulkUploadParticipants
│   │   ├── exports.ts     # exportParticipantsCSV
│   │   └── realtime-sync.ts # Firestore → RTDB sync (events, admins, invites, participants)
│   ├── package.json
│   └── tsconfig.json
├── _config.yml
├── firebase.json          # Functions, Firestore rules, RTDB rules
├── .firebaserc            # Default Firebase project
├── database.rules.json    # Realtime Database rules
├── firestore.rules        # Firestore rules
├── netlify.toml
├── Gemfile
└── README.md
```

## 🔥 Firebase Backend (Overview)

- **Firestore** holds events (`events/{id}` with `participantsCount`, `certificatesCount`), participants (`events/{id}/participants/{id}`), admins (`admins/{uid}`), and invites (`invites/{id}`). It is the source of truth.
- **Cloud Functions** keep counters up to date on event docs, sync Firestore data into **Realtime Database** for fast reads, and expose callables for admin stats, search, bulk upload, and CSV export. Admin checks and stats are cached in-memory to reduce Firestore reads.
- **Realtime Database** is used as a cache: event list, participant index, and search index. Public certificate search uses the RTDB search index then a single Firestore doc read (no full collection query). The admin dashboard loads event list and participant lists from RTDB when possible.
- **Free tier**: Callables use caching; stats read one event doc. Bulk uploads and sync triggers scale with data changes. Stay within Blaze free allowances (e.g. 2M invocations/month) by limiting large bulk uploads and heavy admin exports. See [Firebase pricing](https://firebase.google.com/pricing) for current limits.

## 🎯 Usage Guide

### For Administrators

#### 1. **Access Admin Panel**
- Navigate to `/admin/` (or `/admin/participants/` for participant management) and sign in with a Google account that has an `admins/{uid}` document in Firestore
- Manage events and participants; optional Decap CMS for content (see `admin/config.yml`)

#### 2. **Create Events**
- Events are defined in Jekyll `_events/` (front matter: title, slug, template, participantFields, etc.) and optionally linked to Firestore via `firestore_document_id` (or the app’s event creation flow). The admin dashboard lists events from Firestore/RTDB and manages participants per event.

#### 3. **Manage Participants**
- Upload participant lists via CSV (with proper quote handling)
- Manual participant entry with validation
- Export participant data for backup
- Track certificate download status

#### 4. **Monitor Analytics**
- View download statistics
- Track participant engagement
- Monitor system performance

### For Participants

#### 1. **Find Your Certificate**
- Browse events from the main page and open an event’s certificate page
- Enter your **email** or **redeem code** (exact match). Search uses the Realtime Database index then loads your certificate from Firestore; no full collection scan.

#### 2. **Download Certificate**
- If found, your personalized certificate will be displayed
- Click download to get a PDF version
- Certificate status is automatically updated

## 🔐 Security Features

### **Input Validation**
- Email and redeem code validation
- XSS prevention with HTML escaping
- SQL injection prevention for Firestore queries
- Rate limiting for search operations

### **Authentication**
- Google OAuth for admin access
- Domain-based admin email validation
- Secure session management

### **Data Protection**
- HTTPS enforcement
- Content Security Policy (CSP)
- X-Frame-Options protection
- Secure HTTP headers via Netlify

## 📊 Data Model

### **Events Collection (Jekyll)**
```yaml
title: "Event Title"
slug: "event-slug"
description: "Event description"
date: "2024-01-15"
status: "active" # active | closed
template: "/assets/templates/event-template.png"
firestore_document_id: "event_doc_id"
participantFields:
  - key: "name"
    label: "Full Name"
    required: true
    x: "20%"
    y: 350
    font_size: 50
    color: "#000000"
```

### **Firestore**

- **events/{eventId}**: title, date, participantFields, `participantsCount`, `certificatesCount`, updatedAt, createdAt.
- **events/{eventId}/participants/{participantId}**: name, email (or redeem code), certificateStatus, downloadedAt, createdAt, updatedAt, additionalFields (custom fields).
- **admins/{uid}**: email, createdAt (admin list synced to RTDB for dashboard).
- **invites/{inviteId}**: invite records (synced to RTDB).

### **Realtime Database (cache/index)**

- `events/list`: array of event summaries for admin dashboard.
- `events/{eventId}/meta`, `events/{eventId}/counters`: event metadata and live counters.
- `events/{eventId}/participants/index/{id}`: participant row data (including additionalFields) for admin table.
- `events/{eventId}/search/{id}`: search index (email, searchText) for public certificate lookup.
- `admins/list`, `invites/list`: for dashboard dropdowns/lists.

## 🚀 Deployment

### **Netlify (site)**
1. Connect the repo to Netlify.
2. Build: `bundle exec jekyll build`; publish directory: `_site`.
3. Add any env vars your build needs (Firebase config is in repo for this project; do not commit secrets in production).
4. Deploy; HTTPS and headers are handled by Netlify.

### **Firebase (rules + functions)**
- **Rules:** `firebase deploy --only firestore,database`
- **Functions:** Use Node 20, then from project root:
  ```bash
  export NODE_OPTIONS="--max-old-space-size=4096"
  export FUNCTIONS_DISCOVERY_TIMEOUT=120
  firebase use <your-project-id>
  firebase deploy --only functions --force
  ```
  See **Deploy Firebase Cloud Functions** in Setup for details. Functions are optimized for deploy (lazy admin init, scripts excluded from bundle).

## 🔧 Configuration

### **Event Configuration**
- **Jekyll**: `_events/*.md` front matter defines title, slug, date, template path, participant fields (key, label, position, font size, color), and optional Firestore document ID.
- **Firestore**: Event documents store live counters and config synced for the dashboard and callables. Cloud Functions keep counters and RTDB in sync when participants or certificates change.

### **Certificate Templates**
- PNG format templates stored in `/assets/templates/`
- Dynamic field positioning via configuration
- Customizable fonts, colors, and sizing
- Responsive design considerations

## 📈 Performance & Cost

- **Site**: Jekyll static build, CDN-ready assets, compression.
- **Backend**: Firestore is source of truth; RTDB and in-function caches reduce reads. Stats use one event doc; admin verification and event config are cached. Public certificate search uses RTDB index + one Firestore doc read (no collection query). CSV export can use the callable (server) or client-side export from cache when available.
- **Free tier**: Optimized to stay within typical Blaze free allowances; watch invocation and Firestore usage if you run large bulk uploads or frequent full exports.

## 🛡️ Security Considerations

- **Input Sanitization**: All user inputs are validated and sanitized
- **Rate Limiting**: Prevents abuse of search functionality
- **CSRF Protection**: Token-based request validation
- **Secure Headers**: Comprehensive HTTP security headers
- **Firebase Rules**: Proper Firestore security rules

## 📞 Support

### **Technical Support**
- **Developer**: ZeoSpec
- **Email**: contact@zeospec.com
- **Website**: https://rtr.zeospec.com/

### **Organization Contact**
- **Organization**: Rotaract South Asia MDIO
- **Contact**: PDRR Arun Teja Godavarthi
- **Email**: rsamdio@gmail.com

## 📄 License

This project is developed for Rotaract South Asia MDIO. All rights reserved.

## 🤝 Contributing

This is a specialized project for RSAMDIO. For contributions or modifications, please contact the development team.

---

**Built with ❤️ for Rotaract South Asia MDIO by ZeoSpec**