"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseServices, isFirebaseClientConfigured } from "@/lib/firebase-client";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  acceptInvite,
  getMyPendingInvites,
  PendingInvite,
  syncAdminClaims
} from "@/lib/callables";

type RoleState = {
  ready: boolean;
  user: User | null;
  allowed: boolean;
  role: "super" | "platform" | "manager" | null;
};

function AuthEntryShell({
  children,
  title,
  lead
}: {
  children: React.ReactNode;
  title: string;
  lead: string;
}) {
  return (
    <div className="auth-entry">
      <div className="auth-entry-inner">
        <header className="auth-entry-brand">
          <img
            src="/assets/images/rsamdio.webp"
            alt="Rotaract South Asia MDIO"
            width={88}
            height={88}
          />
          <p className="auth-entry-kicker">Rotaract South Asia MDIO</p>
          <h1>Rotaract Certify</h1>
          <p className="auth-entry-sub">Organizer workspace</p>
        </header>

        <section className="auth-entry-card card rise">
          <h2>{title}</h2>
          <p>{lead}</p>
          {children}
        </section>

        <div className="auth-guide">
          <article className="auth-guide-card">
            <span>01</span>
            <h3>Sign in</h3>
            <p>Use your authorized Google account to open the organizer workspace.</p>
          </article>
          <article className="auth-guide-card">
            <span>02</span>
            <h3>Manage activities</h3>
            <p>
              Follow the{" "}
              <Link href="/playbook">organizer playbook</Link>: designs, people, placement, then
              publish. More templates live in the{" "}
              <a href="https://library.rsamdio.org/" target="_blank" rel="noopener noreferrer">
                Rotaract Library
              </a>
              .
            </p>
          </article>
          <article className="auth-guide-card">
            <span>03</span>
            <h3>Publish</h3>
            <p>When everything looks right, publish so members can download their certificates.</p>
          </article>
        </div>

        <p className="auth-entry-foot">
          Looking for your own certificate?{" "}
          <Link href="/">Go to Rotaract Certify</Link>
        </p>
      </div>
    </div>
  );
}

function inviteSummary(invite: PendingInvite) {
  if (invite.type === "platform") return "Platform admin for Rotaract Certify";
  if (invite.type === "manager" && invite.activitySlug) {
    return `Activity manager for “${invite.activitySlug}”`;
  }
  return "Organizer access";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RoleState>({
    ready: false,
    user: null,
    allowed: false,
    role: null
  });
  const [signingIn, setSigningIn] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      setState({ ready: true, user: null, allowed: false, role: null });
      return;
    }
    const { auth, db } = getFirebaseServices();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPendingInvites([]);
        setState({ ready: true, user: null, allowed: false, role: null });
        return;
      }
      try {
        const cacheKey = `rsacertify:claimsAt:${user.uid}`;
        const last = Number(sessionStorage.getItem(cacheKey) || 0);
        const stale = Date.now() - last > 5 * 60_000;
        if (stale) {
          await syncAdminClaims();
          sessionStorage.setItem(cacheKey, String(Date.now()));
        }
      } catch {
        // Claims sync may fail before seed; continue with Firestore admin check.
      }
      const token = await user.getIdTokenResult(true);
      const claimRole = String(token.claims.role || "");
      const adminDoc = await getDoc(doc(db, "admins", user.uid));
      let role: RoleState["role"] = null;
      if (adminDoc.exists()) {
        role = (adminDoc.data()?.role as "super" | "platform") || "platform";
      } else if (claimRole === "manager") {
        role = "manager";
      }
      if (!role) {
        try {
          const mine = await getMyPendingInvites();
          setPendingInvites(mine.invites || []);
        } catch {
          setPendingInvites([]);
        }
      } else {
        setPendingInvites([]);
      }
      setState({
        ready: true,
        user,
        allowed: Boolean(role),
        role
      });
    });
  }, []);

  async function signIn() {
    setSigningIn(true);
    try {
      const { auth } = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setSigningIn(false);
    }
  }

  async function acceptAllPending() {
    if (!state.user || pendingInvites.length === 0) return;
    setAccepting(true);
    setAcceptError("");
    try {
      for (const invite of pendingInvites) {
        await acceptInvite(invite.id);
      }
      await syncAdminClaims();
      const { auth, db } = getFirebaseServices();
      const user = auth.currentUser;
      if (!user) return;
      await user.getIdToken(true);
      const token = await user.getIdTokenResult(true);
      const claimRole = String(token.claims.role || "");
      const adminDoc = await getDoc(doc(db, "admins", user.uid));
      let role: RoleState["role"] = null;
      if (adminDoc.exists()) {
        role = (adminDoc.data()?.role as "super" | "platform") || "platform";
      } else if (claimRole === "manager") {
        role = "manager";
      }
      setPendingInvites([]);
      setState({ ready: true, user, allowed: Boolean(role), role });
      if (!role) {
        setAcceptError("Invite accepted, but access didn’t refresh. Sign out and sign in again.");
      }
    } catch (err) {
      console.error(err);
      setAcceptError("Could not accept the invite. Make sure you’re signed in with the invited Google account.");
    } finally {
      setAccepting(false);
    }
  }

  if (!state.ready) {
    return (
      <div className="auth-entry auth-entry-loading" role="status">
        <div className="auth-entry-inner">
          <img
            src="/assets/images/rsamdio.webp"
            alt=""
            width={64}
            height={64}
            className="auth-entry-loading-mark"
          />
          <div className="admin-loading-bar" />
          <p>Opening organizer access…</p>
        </div>
      </div>
    );
  }

  if (!isFirebaseClientConfigured()) {
    return (
      <AuthEntryShell
        title="Setup needed"
        lead="Organizer sign-in isn’t fully configured on this site yet. Please contact support."
      >
        <a className="btn" href="mailto:rsamdio@gmail.com">
          Contact support
        </a>
        <Link className="btn btn-secondary" href="/">
          Back to site
        </Link>
      </AuthEntryShell>
    );
  }

  if (!state.user) {
    return (
      <AuthEntryShell
        title="Organizer access"
        lead="Sign in with Google to manage certificate programs for Rotaract South Asia MDIO."
      >
        <button className="btn btn-block" type="button" onClick={signIn} disabled={signingIn}>
          {signingIn ? "Opening Google…" : "Continue with Google"}
        </button>
        <p className="auth-entry-note">
          Only invited platform admins and activity managers can enter this workspace.
        </p>
      </AuthEntryShell>
    );
  }

  if (!state.allowed) {
    if (pendingInvites.length > 0) {
      return (
        <AuthEntryShell
          title="You’re invited"
          lead="An invite is waiting for this Google account. Accept it to open the organizer workspace. No separate invite code is needed."
        >
          <p className="auth-entry-account">{state.user.email}</p>
          <ul className="auth-invite-list">
            {pendingInvites.map((invite) => (
              <li key={invite.id}>{inviteSummary(invite)}</li>
            ))}
          </ul>
          {acceptError ? <p className="status-error">{acceptError}</p> : null}
          <button
            className="btn btn-block"
            type="button"
            onClick={acceptAllPending}
            disabled={accepting}
          >
            {accepting ? "Accepting…" : "Accept invite"}
          </button>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            onClick={() => signOut(getFirebaseServices().auth)}
          >
            Sign out and try another account
          </button>
        </AuthEntryShell>
      );
    }

    return (
      <AuthEntryShell
        title="Access not granted"
        lead="This Google account isn’t set up for Rotaract Certify yet. Ask a platform admin to invite you from Team (platform admin) or from an activity’s Managers tab (activity-only access)."
      >
        <p className="auth-entry-account">{state.user.email}</p>
        <button
          className="btn btn-block"
          type="button"
          onClick={() => signOut(getFirebaseServices().auth)}
        >
          Sign out and try another account
        </button>
        <Link className="btn btn-secondary btn-block" href="/">
          Back to public site
        </Link>
      </AuthEntryShell>
    );
  }

  return (
    <AdminShell
      email={state.user.email}
      displayName={state.user.displayName}
      photoURL={state.user.photoURL}
      role={state.role}
    >
      {children}
    </AdminShell>
  );
}
