# Organizer access model

Source of truth and promote/demote rules for Rotaract Certify admin access. Claims are derived only.

## Actors

| Actor | Access |
| --- | --- |
| Anonymous / public visitor | Public catalog + certificate lookup only |
| Pending invitee | Signed in; can list/accept invites for their Google email |
| Activity manager | Activities listed in `managed_activities` (and matching manager docs) |
| Platform admin | All activities; Team list (not invite/remove unless super) |
| Super admin | Platform admin + invite/remove platform admins |

## Source of truth (Firestore)

| Path | Meaning |
| --- | --- |
| `admins/{uid}` | Platform or super. Fields: `email`, `role` (`platform` \| `super`) |
| `activities/{slug}/managers/{uid}` | Activity manager for that slug only |
| `invites/{id}` | Pending grant. Client R/W denied; callables only |

Both `admins/{uid}` and one or more manager docs may exist at once (intentional dual membership).

## Derived claims (Auth custom claims)

Refreshed by `refreshClaimsForUid` / `syncAdminClaims`:

| Claim | Meaning |
| --- | --- |
| `role` | `super` \| `platform` \| `manager` (single label for UI; platform/super wins if admin doc exists) |
| `managed_activities` | `{ [slug]: true }` for every manager doc, **including when the user is also platform/super** |

Enforcement:

- **Writes / callables / Firestore rules:** membership docs (`admins`, `managers`), not claims.
- **RTDB admin catalog reads:** claims (`role` / `managed_activities`).
- **UI:** hints only; never the security boundary.

## Who can invite / revoke / remove

| Action | Allowed |
| --- | --- |
| Invite platform admin | Super only |
| List / cancel platform invites | Super (create/cancel); platform may list |
| Invite / cancel / remove activity manager | Platform or super only |
| List activity pending invites | Platform, super, or manager of that activity (read-only for managers) |
| Accept invite | Signed-in Google user with verified email matching invite |
| Remove platform admin | Super only (cannot remove super) |
| Remove activity manager | Platform or super only |

Removing a platform admin does **not** delete activity manager rows. Manage those per activity Managers tab.

## Promote / demote

| Transition | Behavior |
| --- | --- |
| Manager → accept platform invite | Writes `admins/{uid}`; **keeps** existing manager docs; claims become `platform`/`super` **plus** `managed_activities` |
| Platform → remove from Team | Deletes `admins/{uid}` only; refresh claims from remaining manager docs → activity-only access |
| Remove manager while still platform | Deletes that manager doc; user stays platform for all activities |
| Remove last manager role (no admin doc) | Clears organizer claims; access denied until re-invited |

Upgrades for users already in the workspace use **explicit in-app accept** (pending invite banner), not silent auto-grant.

## Must-pass demotion story

1. User is manager of `demo` only.
2. Accept platform invite → Team visible; still listed under demo managers.
3. Super removes them from Team → no Team, no create/delete activity; still edit `demo` only.

## Rules alignment (confirmed)

- **Firestore:** writes use `admins` / `managers` docs (`isPlatform`, `isManagerOf`). `invites` and `admins` writes are Admin SDK / callables only.
- **RTDB:** admin catalog list requires `role` super|platform; per-slug catalog/counters allow `managed_activities[slug]`. Dual-role platform users still pass list reads via `role`; manager-only users use the map.
- No Firestore/RTDB rule changes required for dual-role claims merge.
