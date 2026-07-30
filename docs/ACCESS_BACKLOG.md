# Access management backlog

Follow-ups after the dual-role hardening release. Not blocking ship of [ACCESS_MODEL.md](./ACCESS_MODEL.md).

## Tickets

### Claims size strategy
- **Why:** Auth custom claims ~1KB; many `managed_activities` keys can fail `setCustomUserClaims`.
- **Idea:** Cap already at 40; longer-term store `is_manager` boolean in claims and resolve slugs from Firestore/RTDB.

### Full offboard callable
- **Why:** Removing platform admin leaves manager rows (by design). Ops sometimes need “remove all organizer access”.
- **Idea:** Super-only `offboardOrganizer({ uid })` deletes `admins/{uid}` + all `activities/*/managers/{uid}` + pending invites for that email, then refresh claims.

### Rate limits on invite create / accept
- **Why:** Bound invite spam and accept probing.
- **Idea:** Reuse durable Firestore rate-limit pattern from `verifyCertificate`.

### Structured audit log
- **Why:** Who invited / accepted / revoked / removed whom.
- **Idea:** `accessAudit/{id}` via Admin SDK on invite accept/revoke/remove (immutable, no client write).

### Shared `useOrganizerAccess` helper
- **Why:** Activities list, Team, Managers, New activity each re-read claims differently.
- **Idea:** One hook: `{ role, canManagePlatform, canMutateManagers, managedSlugs, refresh }`.
