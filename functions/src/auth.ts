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

export type AdminRole = 'super' | 'platform';

export async function getAdminRole(context: functions.https.CallableContext): Promise<AdminRole> {
    ensureAdmin();
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const adminDoc = await getAdmin().firestore().doc(`admins/${context.auth.uid}`).get();
    if (!adminDoc.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const role = String(adminDoc.data()?.role || 'platform');
    if (role !== 'super' && role !== 'platform') {
        throw new functions.https.HttpsError('permission-denied', 'Invalid admin role');
    }
    return role as AdminRole;
}

export async function verifyPlatformOrManager(
    context: functions.https.CallableContext,
    activitySlug: string
): Promise<{ uid: string; role: 'super' | 'platform' | 'manager' }> {
    ensureAdmin();
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const uid = context.auth.uid;

    const adminDoc = await getAdmin().firestore().doc(`admins/${uid}`).get();
    if (adminDoc.exists) {
        const role = String(adminDoc.data()?.role || 'platform');
        if (role === 'super' || role === 'platform') {
            return { uid, role };
        }
    }

    const managerDoc = await getAdmin().firestore().doc(`activities/${activitySlug}/managers/${uid}`).get();
    if (managerDoc.exists) {
        return { uid, role: 'manager' };
    }

    throw new functions.https.HttpsError('permission-denied', 'Activity access required');
}
