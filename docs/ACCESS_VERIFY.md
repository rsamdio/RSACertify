# Access management verification matrix

Standing checklist for organizer access (promote / demote / lockout). Run against production or staging with a throwaway Google account before relying on dual-role in ops.

Policy: [ACCESS_MODEL.md](./ACCESS_MODEL.md).

## Implementation sign-off

| Item | Status |
| --- | --- |
| `verifyAdmin` no longer uses positive TTL cache | Done |
| Dual-role claims merge `managed_activities` for platform/super | Done |
| Accept requires verified email + positive expiry; preserves super | Done |
| Invite create rejects duplicates / missing activity | Done |
| Managers tab mutations platform-only (UI + callables) | Done |
| AuthGate pending invites for existing organizers | Done |
| Team / new-activity soft redirect for managers | Done |
| Firestore/RTDB rules match SoT (docs for writes; claims for RTDB reads) | Confirmed — no rule change required |

## Manual checklist (must pass before ops rely on demotion)

Use a dedicated test Google account (not super). Prefer activity slug `demo` if present.

1. **Manager accept** — Invite as manager → accept → workspace → only managed activities → no Team → no Create activity.
2. **Manager cannot mutate roster** — Managers tab: no invite form / Cancel / Remove (view only).
3. **Platform upgrade** — While manager, invite as platform from Team → in-app pending banner → Accept → Team visible → still listed under activity managers.
4. **Demote platform** — Super removes from Team → within seconds: no Team, no create/delete; still edit managed activity; other activities denied. Cold function instance still denies `verifyAdmin`.
5. **Remove manager while platform** — Still full platform access; managers list updated.
6. **Remove last manager role** — Access denied until re-invited.
7. **Wrong Google account** — Accept fails; invite remains.
8. **Expired invite** — Denied (no missing-expiry immortal invites).
9. **Super integrity** — Cannot remove super; accepting platform invite does not demote super.
10. **Stale tab after demotion** — Refresh / re-login restores correct gate.
11. **Claims recovery** — If accept succeeds but UI sticks, sync/relogin recovers when membership docs exist.

Log review during tests: no `FAILED_PRECONDITION` / `INTERNAL` on `acceptInvite` / `syncAdminClaims`.

## Deploy notes

```bash
cd functions && npm run build
firebase deploy --only firestore:indexes,functions:acceptInvite,functions:invitePlatformAdmin,functions:inviteActivityManager,functions:revokeInvite,functions:removePlatformAdmin,functions:removeActivityManager,functions:syncAdminClaims,functions:getMyPendingInvites,functions:listActivityInvites,functions:listPlatformInvites
```

Also redeploy any callable that still bundled old `verifyAdmin` / claims helpers if shared code changed — safest:

```bash
firebase deploy --only functions
```
