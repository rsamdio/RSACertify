import * as functions from 'firebase-functions/v1';
import { getAdmin, ensureAdmin } from './admin';
import { adminCache, getAdminCacheKey } from './cache';

/**
 * Verify caller is an admin. Uses short-lived in-memory cache to avoid repeated Firestore reads.
 */
export async function verifyAdmin(context: functions.https.CallableContext): Promise<void> {
    ensureAdmin();
    if (!context || !context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated'
        );
    }
    const uid = context.auth.uid;
    const cacheKey = getAdminCacheKey(uid);
    if (adminCache.get(cacheKey)) {
        return;
    }
    const adminDoc = await getAdmin().firestore()
        .doc(`admins/${uid}`)
        .get();
    if (!adminDoc.exists) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Admin access required'
        );
    }
    adminCache.set(cacheKey, true);
}
