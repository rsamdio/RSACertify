import * as functions from "firebase-functions/v1";
import { fn } from "./runtime";
import { getAdmin, ensureAdmin } from "./admin";

type ClaimsShape = {
  role?: "super" | "platform" | "manager";
  managed_activities?: Record<string, boolean>;
};

/** Soft guard — Auth custom claims are ~1000 bytes; leave headroom for other claims. */
const MAX_MANAGED_ACTIVITY_KEYS = 40;

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

async function findManagedActivities(
  db: FirebaseFirestore.Firestore,
  uid: string
): Promise<Record<string, boolean>> {
  const managed: Record<string, boolean> = {};

  try {
    const byUidField = await db.collectionGroup("managers").where("uid", "==", uid).get();
    if (byUidField.size > 0) {
      for (const managerDoc of byUidField.docs) {
        const activitySlug = managerDoc.ref.parent.parent?.id;
        if (activitySlug) managed[activitySlug] = true;
      }
      return managed;
    }
  } catch (err) {
    // Missing COLLECTION_GROUP index (or similar) — fall back to per-activity docs.
    console.warn("managers collectionGroup query failed; using per-activity fallback", err);
  }

  const activitiesSnap = await db.collection("activities").select().get();
  await Promise.all(
    activitiesSnap.docs.map(async (activityDoc) => {
      const managerDoc = await db.doc(`activities/${activityDoc.id}/managers/${uid}`).get();
      if (managerDoc.exists) managed[activityDoc.id] = true;
    })
  );
  return managed;
}

function capManagedActivities(managed: Record<string, boolean>): Record<string, boolean> {
  const keys = Object.keys(managed);
  if (keys.length <= MAX_MANAGED_ACTIVITY_KEYS) return managed;
  console.warn(
    `managed_activities truncated from ${keys.length} to ${MAX_MANAGED_ACTIVITY_KEYS} for claims size`
  );
  const capped: Record<string, boolean> = {};
  for (const key of keys.slice(0, MAX_MANAGED_ACTIVITY_KEYS)) {
    capped[key] = true;
  }
  return capped;
}

export async function refreshClaimsForUid(uid: string): Promise<ClaimsShape> {
  ensureAdmin();
  const db = getAdmin().firestore();
  const adminDoc = await db.doc(`admins/${uid}`).get();
  const managed = capManagedActivities(await findManagedActivities(db, uid));

  if (adminDoc.exists) {
    const role = String(adminDoc.data()?.role || "platform");
    const claims: ClaimsShape = {
      role: role === "super" ? "super" : "platform",
      managed_activities: managed
    };
    await setUserClaims(uid, claims);
    return claims;
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
