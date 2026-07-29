"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase-client";

function roleLabel(role: string | null | undefined) {
  switch (role) {
    case "super":
      return "Super admin";
    case "platform":
      return "Platform admin";
    case "manager":
      return "Activity manager";
    default:
      return "Organizer";
  }
}

function initialsFrom(email?: string | null, name?: string | null) {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  if (source.includes("@")) return source[0]!.toUpperCase();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AdminShell({
  children,
  email,
  displayName,
  photoURL,
  role
}: {
  children: React.ReactNode;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role?: string | null;
}) {
  const pathname = usePathname();
  const [showTeam, setShowTeam] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolvedRole, setResolvedRole] = useState(role || "");
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { auth } = getFirebaseServices();
      const token = await auth.currentUser?.getIdTokenResult();
      const nextRole = String(token?.claims.role || role || "");
      setResolvedRole(nextRole);
      setShowTeam(nextRole === "super" || nextRole === "platform");
    })().catch(() => setShowTeam(false));
  }, [role]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const activitiesActive =
    pathname === "/admin/activities" || pathname?.startsWith("/admin/activities/");
  const teamActive = pathname?.startsWith("/admin/team");
  const initials = initialsFrom(email, displayName);

  return (
    <div className="admin-app">
      <div className="admin-float-wrap">
        <header className="admin-float">
          <Link href="/admin/activities" className="admin-float-brand" prefetch>
            <img src="/assets/images/rsamdio.webp" alt="" width={40} height={40} />
            <span className="admin-float-brand-text">
              <strong>Rotaract Certify</strong>
              <small>Organizer workspace</small>
            </span>
          </Link>

          <nav className="admin-float-nav" aria-label="Admin">
            <Link
              href="/admin/activities"
              className={`admin-float-link${activitiesActive ? " is-active" : ""}`}
              onClick={() => startTransition(() => undefined)}
              prefetch
            >
              Activities
            </Link>
            {showTeam ? (
              <Link
                href="/admin/team"
                className={`admin-float-link${teamActive ? " is-active" : ""}`}
                prefetch
              >
                Team
              </Link>
            ) : null}
          </nav>

          <div className="admin-float-actions">
            <Link className="admin-home-btn" href="/" prefetch>
              Home
            </Link>
            <div className="admin-avatar-wrap" ref={menuRef}>
              <button
                type="button"
                className="admin-avatar"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                title={email || "Account"}
              >
                {photoURL ? (
                  <img src={photoURL} alt="" className="admin-avatar-img" referrerPolicy="no-referrer" />
                ) : (
                  initials
                )}
              </button>
              {menuOpen ? (
                <div className="admin-avatar-menu" role="menu">
                  <div className="admin-avatar-menu-head">
                    <strong>{displayName || "Organizer"}</strong>
                    <span>{email}</span>
                    <em>{roleLabel(resolvedRole)}</em>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => signOut(getFirebaseServices().auth)}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      </div>

      <div className={`admin-content${pending ? " is-pending" : ""}`}>{children}</div>
    </div>
  );
}
