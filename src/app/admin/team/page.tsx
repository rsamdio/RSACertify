"use client";

import { FormEvent, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase-client";
import {
  invitePlatformAdmin,
  listPlatformInvites,
  PendingInvite,
  removePlatformAdmin,
  revokeInvite,
  syncAdminClaims
} from "@/lib/callables";

type AdminRow = { uid: string; email?: string; role?: string };

function roleLabel(role?: string) {
  switch (role) {
    case "super":
      return "Super admin";
    case "platform":
      return "Platform admin";
    default:
      return role || "Platform admin";
  }
}

function formatExpiry(expiresAt?: number) {
  if (!expiresAt) return "—";
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TeamPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canInvite, setCanInvite] = useState(false);

  async function refreshAdmins() {
    const { db } = getFirebaseServices();
    const snap = await getDocs(collection(db, "admins"));
    setAdmins(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AdminRow, "uid">) })));
  }

  async function refreshPending() {
    try {
      const result = await listPlatformInvites();
      setPending(result.invites || []);
    } catch {
      setPending([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await syncAdminClaims();
      } catch {
        // ignore
      }
      const { auth } = getFirebaseServices();
      const token = await auth.currentUser?.getIdTokenResult();
      const role = String(token?.claims.role || "");
      setCanInvite(role === "super");
      await Promise.all([refreshAdmins(), refreshPending()]);
    })().catch(console.error);
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await invitePlatformAdmin(email.trim().toLowerCase());
      setEmail("");
      setMessage(
        "Invite created. No email is sent automatically — tell them to sign in at /admin with that Google account, then accept the invite on the access screen."
      );
      await refreshPending();
    } catch (err) {
      console.error(err);
      setError("Could not create invite. Only the primary (super) account can invite platform admins.");
    } finally {
      setSaving(false);
    }
  }

  async function onRevoke(inviteId: string) {
    if (!confirm("Cancel this pending invite?")) return;
    setSaving(true);
    setError("");
    try {
      await revokeInvite(inviteId);
      await refreshPending();
      setMessage("Pending invite cancelled.");
    } catch (err) {
      console.error(err);
      setError("Could not cancel that invite.");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(uid: string) {
    if (!confirm("Remove this platform admin?")) return;
    await removePlatformAdmin(uid);
    await refreshAdmins();
  }

  return (
    <section className="admin-page stack">
      <div className="admin-page-head">
        <div>
          <h1>Team</h1>
          <p>
            Platform admins can manage activities across Rotaract Certify. Per-activity managers are invited
            from each activity’s Managers tab — not here.
          </p>
        </div>
      </div>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}

      {canInvite ? (
        <div className="card admin-panel stack">
          <div>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Invite a platform admin</h3>
            <p className="meta" style={{ margin: "0.35rem 0 0" }}>
              Creates a pending invite for their Google email. They must sign in with that account and accept —
              we do not email them from Certify.
            </p>
          </div>
          <form className="invite-inline" onSubmit={onInvite}>
            <div className="field" style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="inviteEmail">Google email</label>
              <input
                id="inviteEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@rsamdio.org"
                required
              />
            </div>
            <button className="btn" type="submit" disabled={saving}>
              Create invite
            </button>
          </form>
        </div>
      ) : (
        <div className="card admin-panel">
          <p className="meta" style={{ margin: 0 }}>
            Only the primary (super) account can invite new platform admins.
          </p>
        </div>
      )}

      <div className="card admin-panel">
        <h3 style={{ marginTop: 0, color: "var(--navy)" }}>Pending invites</h3>
        {pending.length === 0 ? (
          <p className="meta">No pending platform-admin invites.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td>Platform admin</td>
                    <td>{formatExpiry(invite.expiresAt)}</td>
                    <td>
                      {canInvite ? (
                        <button
                          className="btn btn-secondary btn-compact"
                          type="button"
                          disabled={saving}
                          onClick={() => onRevoke(invite.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card admin-panel">
        <h3 style={{ marginTop: 0, color: "var(--navy)" }}>Platform admins</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.uid}>
                  <td>{admin.email || admin.uid}</td>
                  <td>
                    {roleLabel(admin.role)}
                    {admin.role === "super" ? (
                      <span className="meta" style={{ marginLeft: "0.5rem" }}>
                        primary account
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {admin.role === "super" ? null : canInvite ? (
                      <button
                        className="btn btn-secondary btn-compact"
                        type="button"
                        onClick={() => onRemove(admin.uid)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
