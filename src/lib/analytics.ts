"use client";

import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";
import { getApps } from "firebase/app";
import { firebasePublicConfig } from "@/lib/firebase-config";
import { getFirebaseServices, isFirebaseClientConfigured } from "@/lib/firebase-client";

let analyticsInstance: Analytics | null = null;
let analyticsInit: Promise<Analytics | null> | null = null;

async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (!isFirebaseClientConfigured() || !firebasePublicConfig.measurementId) return null;
  if (analyticsInstance) return analyticsInstance;
  if (analyticsInit) return analyticsInit;

  analyticsInit = (async () => {
    try {
      const supported = await isSupported();
      if (!supported) return null;
      getFirebaseServices();
      const app = getApps()[0];
      if (!app) return null;
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    } catch {
      return null;
    }
  })();

  return analyticsInit;
}

export function trackEvent(
  name:
    | "catalog_view"
    | "activity_open"
    | "lookup_submit"
    | "lookup_found"
    | "lookup_miss"
    | "download_start"
    | "download_success"
    | "download_error",
  params?: Record<string, string | number | boolean>
): void {
  void getAnalyticsInstance().then((analytics) => {
    if (!analytics) return;
    logEvent(analytics, name, params);
  });
}
