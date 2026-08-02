import { NextRequest, NextResponse } from "next/server";

/**
 * Production-safe CSP for Next.js on Netlify.
 *
 * Per-request script nonces + 'strict-dynamic' break ISR/static HTML (cached
 * markup cannot match a fresh nonce) and block Next/Firebase inline loaders.
 * Host allowlists + 'unsafe-inline' keep App Check, Auth, Analytics, and App
 * Router hydration working. 'unsafe-eval' stays development-only for HMR.
 */
export function middleware(_request: NextRequest) {
  const scriptSrcEval =
    process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    [
      "script-src 'self'",
      "'unsafe-inline'",
      scriptSrcEval,
      "https://www.googletagmanager.com",
      "https://www.gstatic.com",
      "https://www.google.com",
      "https://www.recaptcha.net",
      "https://apis.google.com",
      "https://*.googleapis.com",
      "https://*.firebaseapp.com"
    ]
      .filter(Boolean)
      .join(" "),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    [
      "connect-src 'self'",
      "https://*.googleapis.com",
      "https://*.firebaseapp.com",
      "https://*.firebasestorage.app",
      "https://*.firebasedatabase.app",
      "https://*.asia-southeast1.firebasedatabase.app",
      // RTDB client uses WebSockets — Activities list hangs without these.
      "wss://*.firebasedatabase.app",
      "wss://*.asia-southeast1.firebasedatabase.app",
      "https://*.cloudfunctions.net",
      "https://asia-southeast1-rsacertify.cloudfunctions.net",
      "https://*.r2.cloudflarestorage.com",
      "https://*.r2.dev",
      "https://cert.rsamdio.org",
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://www.google.com",
      "https://www.recaptcha.net"
    ].join(" "),
    [
      "frame-src 'self'",
      "https://*.firebaseapp.com",
      "https://*.google.com",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://www.recaptcha.net",
      "https://www.gstatic.com"
    ].join(" "),
    "worker-src 'self' blob:",
    // Allow RSAMDIO main site (and local parent-site testing) to iframe Certify.
    // Keep allowlisted — never use frame-ancestors *.
    "frame-ancestors 'self' https://rsamdio.org https://www.rsamdio.org http://localhost:3000",
    "upgrade-insecure-requests"
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  // same-origin breaks Firebase signInWithPopup (window.closed / opener access).
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.webp|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
