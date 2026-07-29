import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getDatabase, type Database } from "firebase/database";
import { firebasePublicConfig } from "@/lib/firebase-config";

const firebaseConfig = firebasePublicConfig;

function hasConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

function initFirebaseApp(): FirebaseApp {
  if (!hasConfig()) {
    throw new Error("Missing Firebase web config");
  }
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;
let rtdbInstance: Database | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckStarted = false;

function ensureAppCheck(firebaseApp: FirebaseApp) {
  if (appCheckStarted || typeof window === "undefined") return;
  appCheckStarted = true;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey) {
    console.warn(
      "[firebase] NEXT_PUBLIC_RECAPTCHA_SITE_KEY missing — App Check tokens will not be attached"
    );
    return;
  }
  try {
    appCheckInstance = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn("[firebase] App Check init failed", error);
  }
}

export function getFirebaseServices() {
  if (!app) {
    app = initFirebaseApp();
  }
  ensureAppCheck(app);
  if (!authInstance) authInstance = getAuth(app);
  if (!dbInstance) dbInstance = getFirestore(app);
  if (!functionsInstance) functionsInstance = getFunctions(app, "asia-southeast1");
  if (!rtdbInstance) rtdbInstance = getDatabase(app);
  return {
    auth: authInstance,
    db: dbInstance,
    functions: functionsInstance,
    rtdb: rtdbInstance,
    appCheck: appCheckInstance
  };
}

export function isFirebaseClientConfigured() {
  return hasConfig();
}
