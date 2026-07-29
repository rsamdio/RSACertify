import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request CSP with script nonces (Next.js App Router pattern).
 * Drops script-src 'unsafe-inline' in favor of nonce + strict-dynamic.
 * style-src keeps 'unsafe-inline' for Next/CSS runtime compatibility.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Next.js React Refresh / webpack HMR evaluate strings in development only.
  const scriptSrcEval =
    process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    // Nonce + strict-dynamic; host allowlist remains for older browsers / App Check / GA loaders
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      scriptSrcEval,
      "https://www.googletagmanager.com",
      "https://www.gstatic.com",
      "https://www.google.com",
      "https://www.recaptcha.net"
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
      "https://*.cloudfunctions.net",
      "https://asia-southeast1-rsacertify.cloudfunctions.net",
      "https://*.r2.cloudflarestorage.com",
      "https://*.r2.dev",
      "https://cert.rsamdio.org",
      "https://www.google-analytics.com",
      "https://www.google.com",
      "https://www.recaptcha.net"
    ].join(" "),
    // Firebase Auth popup + Google / reCAPTCHA iframes
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
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders }
  });
  response.headers.set("Content-Security-Policy", csp);
  // same-origin breaks Firebase signInWithPopup (window.closed / opener access).
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  matcher: [
    /*
     * Apply to all routes except static assets and Next internals.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.webp|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
