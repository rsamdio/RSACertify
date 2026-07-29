import * as functions from "firebase-functions/v1";
import { fn } from "./runtime";
import { getAdmin, ensureAdmin } from "./admin";

type ClaimsShape = {
  role?: "super" | "platform" | "manager";
  managed_activities?: Record<string, boolean>;
};

export async function setUserClaims(uid: string, claims: ClaimsShape): Promise<void> {
  ensureAdmin();
  const auth = getAdmin().auth();
  const user = await auth.getUser(uid);
  const nextClaims: Record<string, unknown> = { ...(user.customClaims || {}) };

  if (claims.role) {
    nextClaims.role = claims.role;
  } else {
    delete nextClaims.role;
  }

  if (claims.managed_activities && Object.keys(claims.managed_activities).length > 0) {
    nextClaims.managed_activities = claims.managed_activities;
  } else {
    delete nextClaims.managed_activities;
  }

  await auth.setCustomUserClaims(uid, nextClaims);
}

export async function refreshClaimsForUid(uid: string): Promise<ClaimsShape> {
  ensureAdmin();
  const db = getAdmin().firestore();
  const adminDoc = await db.doc(`admins/${uid}`).get();
  if (adminDoc.exists) {
    const role = String(adminDoc.data()?.role || "platform");
    const claims: ClaimsShape = {
      role: role === "super" ? "super" : "platform",
      managed_activities: {}
    };
    await setUserClaims(uid, claims);
    return claims;
  }

  // Prefer indexed uid field; fall back to doc-id match across collection group.
  const managed: Record<string, boolean> = {};
  const byUidField = await db.collectionGroup("managers").where("uid", "==", uid).get();
  const docs =
    byUidField.size > 0
      ? byUidField.docs
      : (await db.collectionGroup("managers").get()).docs.filter((d) => d.id === uid);

  for (const managerDoc of docs) {
    const activitySlug = managerDoc.ref.parent.parent?.id;
    if (activitySlug) managed[activitySlug] = true;
  }

  if (Object.keys(managed).length > 0) {
    const claims: ClaimsShape = { role: "manager", managed_activities: managed };
    await setUserClaims(uid, claims);
    return claims;
  }

  await setUserClaims(uid, {});
  return {};
}

export const syncAdminClaims = fn.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  const claims = await refreshClaimsForUid(context.auth.uid);
  return { ok: true, claims };
});
