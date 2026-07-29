# Rotaract Certify — launch checklist

## Ownership

| Team | Handles |
| --- | --- |
| Activity organizers and managers | People-list corrections, lookup details, and design questions |
| RSAMDIO (`rsamdio@gmail.com`) | Organizer access, district questions, and escalation |
| ZeoSpec (`contact@zeospec.com`) | Platform defects, Firebase/Netlify releases, App Check, and secrets |

## Before production or a pilot

- [ ] Confirm the Netlify site uses `netlify.toml`, including `@netlify/plugin-nextjs`, and builds successfully with `npm run build`.
- [ ] Confirm the custom domain is `certify.rsamdio.org`.
- [ ] Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in Netlify and in local `.env.local`.
- [ ] Register the Firebase web app with App Check and keep enforcement enabled for `verifyCertificate`.
- [ ] Deploy Firebase Functions, Firestore rules, RTDB rules, and Storage rules to project `rsacertify`.
- [ ] Confirm Functions are deployed only to `asia-southeast1`; the client also calls that region.
- [ ] Confirm `src/middleware.ts` remains the CSP authority: host allowlists + `'unsafe-inline'` (no script nonces — incompatible with ISR), development-only `unsafe-eval`, Firebase popup frames, and `same-origin-allow-popups` COOP.
- [ ] Confirm no CSP is statically duplicated in `netlify.toml`.
- [ ] Privacy Policy and Terms (last updated **29 July 2026**) match the live product; RSAMDIO board / licensed counsel confirmation complete for India venue, DPDP roles, and cookie/consent needs if required.

## Seed and validate a pilot

1. Create one to three real activities and make them Active.
2. Follow the fixed editor sequence: Details → Design → People → Placement → Managers.
3. Upload certificate designs whose longest edge is at most 3000 px. Use distinct design keys such as `gold`, `silver`, and `bronze`.
4. Add people by CSV or a public Google Sheet, then spot-check lookup and PDF download.
5. Verify a public sheet can be read without authentication. Private Sheets are unsupported; there is no Netlify service account.
6. Test lookup and download on iOS Safari and Android Chrome.
7. Share the public activity URL from the publish flow.

## Pilot go / no-go

- [ ] `verifyCertificate` has App Check and durable rate limiting active.
- [ ] Participant data is not readable from public Firebase paths.
- [ ] Pilot download results and support volume are reviewed after roughly seven days.
- [ ] Organizers can complete the workflow using the public [playbook](https://certify.rsamdio.org/playbook).
