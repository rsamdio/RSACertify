import * as crypto from 'crypto';
import * as functions from 'firebase-functions/v1';
import { fn } from './runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAdmin, getFieldValue, ensureAdmin } from './admin';
import { withMonitoring } from './monitoring';
import { getAdminRole, verifyPlatformOrManager } from './auth';
import { getSecretValue, REQUIRED_RUNTIME_SECRETS } from './secrets';
import { refreshClaimsForUid } from './claims';

const withSecrets = fn.runWith({
    secrets: [...REQUIRED_RUNTIME_SECRETS]
});

const withVerifyProtection = fn.runWith({
    secrets: [...REQUIRED_RUNTIME_SECRETS],
    enforceAppCheck: true
});

type DownloadTokenPayload = {
    activitySlug: string;
    participantId: string;
    exp: number;
};

const RATE_LIMIT_COLLECTION = "rateLimits";
const VERIFY_RATE_MAX = 10;
const VERIFY_RATE_WINDOW_MS = 60_000;
const TEMPLATE_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;
const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const RESERVED_TEMPLATE_KEY = "default";

function now() {
    return Date.now();
}

function isLikelyEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Must stay aligned with client `toLookupKey` in src/lib/security.ts */
function normalizeLookup(input: string): string {
    const trimmed = input.trim().replace(/\s+/g, " ");
    if (isLikelyEmail(trimmed)) {
        return trimmed.toLowerCase();
    }
    return trimmed.replace(/\s+/g, "").toLowerCase();
}

function sanitizeRateLimitDocId(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 700);
}

/**
 * Firestore document IDs can't contain "/" and can't be exactly "." or "..".
 * Lookups are normalized emails or codes, so "/" is the only realistic offender —
 * must stay aligned with client `toLookupDocId` in src/lib/security.ts.
 */
function toLookupDocId(lookup: string): string {
    const cleaned = lookup.replace(/\//g, "_").slice(0, 1500);
    return cleaned === "." || cleaned === ".." ? `_${cleaned}` : cleaned;
}

/** Durable rate limit shared across function instances (Firestore). */
async function enforceDurableRateLimit(
    key: string,
    maxAttempts: number,
    windowMs: number
): Promise<void> {
    const db = getAdmin().firestore();
    const ref = db.collection(RATE_LIMIT_COLLECTION).doc(sanitizeRateLimitDocId(key));
    const current = now();

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() as { count?: number; resetAt?: number } | undefined;
        if (!data || !data.resetAt || data.resetAt < current) {
            tx.set(ref, { count: 1, resetAt: current + windowMs, updatedAt: current });
            return;
        }
        const count = Number(data.count || 0);
        if (count >= maxAttempts) {
            throw new functions.https.HttpsError(
                "resource-exhausted",
                "Too many attempts. Please wait a minute and try again."
            );
        }
        tx.update(ref, { count: count + 1, updatedAt: current });
    });
}

function isHttpsError(error: unknown): error is functions.https.HttpsError {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string" &&
        "httpErrorCode" in error
    );
}

async function getDownloadTokenSecret(): Promise<string> {
    const secretName = process.env.DOWNLOAD_TOKEN_SECRET_NAME || "DOWNLOAD_TOKEN_SECRET";
    const secret = await getSecretValue(secretName);
    if (!secret || secret.length < 32) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "DOWNLOAD_TOKEN_SECRET must be configured with a strong value"
        );
    }
    return secret;
}

async function issueDownloadToken(payload: DownloadTokenPayload): Promise<string> {
    const secret = await getDownloadTokenSecret();
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
}

async function verifyDownloadToken(token: string): Promise<DownloadTokenPayload> {
    const secret = await getDownloadTokenSecret();
    const [body, sig] = token.split(".");
    if (!body || !sig) {
        throw new functions.https.HttpsError("permission-denied", "Invalid token");
    }
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (expected !== sig) {
        throw new functions.https.HttpsError("permission-denied", "Invalid token");
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DownloadTokenPayload;
    if (!payload.exp || payload.exp < now()) {
        throw new functions.https.HttpsError("permission-denied", "Expired token");
    }
    return payload;
}

async function getR2Client(): Promise<S3Client> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyName = process.env.R2_ACCESS_KEY_ID_SECRET_NAME || 'R2_ACCESS_KEY_ID';
    const secretKeyName = process.env.R2_SECRET_ACCESS_KEY_SECRET_NAME || 'R2_SECRET_ACCESS_KEY';
    const accessKeyId = await getSecretValue(accessKeyName);
    const secretAccessKey = await getSecretValue(secretKeyName);
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new functions.https.HttpsError('failed-precondition', 'R2 credentials are not configured');
    }
    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey }
    });
}

function getR2Config() {
    const bucket = process.env.R2_BUCKET_NAME || 'certificates';
    const publicDomain = process.env.R2_PUBLIC_DOMAIN || 'cert.rsamdio.org';
    const maxUploadBytes = Number(process.env.R2_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
    return { bucket, publicDomain, maxUploadBytes };
}

/**
 * Search participants with admin authentication and pagination
 */
export const searchParticipants = fn.https.onCall(
    withMonitoring(async (data, context) => {
    const { activitySlug, query, limit = 50, startAfter } = data;
    
    if (!activitySlug) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'activitySlug is required'
        );
    }
    await verifyPlatformOrManager(context, activitySlug);
    
    if (!query || query.length < 2) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Query must be at least 2 characters'
        );
    }
    
    try {
        // Firestore search
        let firestoreQuery = getAdmin().firestore()
            .collection(`activities/${activitySlug}/participants`)
            .where('name', '>=', query)
            .where('name', '<=', query + '\uf8ff')
            .limit(limit);
        
        // Add pagination if startAfter is provided
        if (startAfter) {
            const startAfterDoc = await getAdmin().firestore()
                .doc(`activities/${activitySlug}/participants/${startAfter}`)
                .get();
            if (startAfterDoc.exists) {
                firestoreQuery = firestoreQuery.startAfter(startAfterDoc);
            }
        }
        
        const snapshot = await firestoreQuery.get();
        
        const results = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        return {
            results,
            hasMore: snapshot.docs.length === limit,
            lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
        };
        
    } catch (error) {
        console.error('Error searching participants:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error searching participants',
            error
        );
    }
    }, 'searchParticipants')
);

/**
 * Bulk upload participants.
 * The admin client pre-filters against the RTDB-loaded people list before this
 * callable runs, but that check can race concurrent imports. Server-side uniqueness
 * is enforced here via `activities/{slug}/lookupKeys/{normalizedLookup}` marker docs:
 * existing lookups are checked with chunked `getAll` reads, and each surviving row
 * writes its participant doc and lookup key together in the same batch.
 */
export const bulkUploadParticipants = fn.https.onCall(
    withMonitoring(async (data, context) => {
    const { activitySlug, participants } = data;
    
    if (!activitySlug) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'activitySlug is required'
        );
    }
    await verifyPlatformOrManager(context, activitySlug);
    
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'participants array is required and must not be empty'
        );
    }
    
    const maxParticipantsPerCall = 5000;
    if (participants.length > maxParticipantsPerCall) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            `Too many participants in a single upload. Maximum allowed is ${maxParticipantsPerCall}.`
        );
    }

    const db = getAdmin().firestore();
    const progressRef = db.doc(`bulkUploads/${context.auth!.uid}`);
    let processed = 0;
    const seenLookups = new Set<string>();

    type PreparedRow = {
        name: string;
        lookup: string;
        lookupDocId: string;
        templateKey?: string;
        additionalFields: Record<string, string>;
    };
    const prepared: PreparedRow[] = [];

    for (const participant of participants as Record<string, unknown>[]) {
        const safeName = typeof participant.name === 'string'
            ? participant.name.trim().slice(0, 200)
            : '';
        const rawLookup = typeof participant.lookup === 'string' ? participant.lookup : '';
        const safeLookup = normalizeLookup(rawLookup).slice(0, 254);
        const rawTemplateKey = typeof participant.templateKey === 'string'
            ? participant.templateKey.trim().toLowerCase().slice(0, 64)
            : '';

        if (!safeName || !safeLookup) {
            continue;
        }
        if (seenLookups.has(safeLookup)) {
            continue;
        }
        seenLookups.add(safeLookup);

        // Reserved design key name only — existence of designs is validated client-side
        // against the already-loaded activity (no Firestore activity read here).
        let templateKey: string | undefined;
        if (rawTemplateKey && rawTemplateKey !== RESERVED_TEMPLATE_KEY) {
            if (TEMPLATE_KEY_PATTERN.test(rawTemplateKey)) {
                templateKey = rawTemplateKey;
            }
        }

        const additionalFields =
            participant.additionalFields && typeof participant.additionalFields === 'object'
                ? (participant.additionalFields as Record<string, string>)
                : {};

        prepared.push({
            name: safeName,
            lookup: safeLookup,
            lookupDocId: toLookupDocId(safeLookup),
            templateKey,
            additionalFields
        });
    }

    if (prepared.length === 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'No valid participants to import'
        );
    }

    try {
        await progressRef.set({
            processed: 0,
            total: prepared.length,
            percentage: 0,
            status: 'processing',
            updatedAt: getFieldValue().serverTimestamp()
        });

        // Check for existing lookupKeys server-side (chunked getAll — cheaper than
        // per-row transactions and closes the race the client-side RTDB check can miss).
        const lookupCheckChunkSize = 300;
        const existingLookupDocIds = new Set<string>();
        for (let i = 0; i < prepared.length; i += lookupCheckChunkSize) {
            const chunk = prepared.slice(i, i + lookupCheckChunkSize);
            const refs = chunk.map((row) =>
                db.doc(`activities/${activitySlug}/lookupKeys/${row.lookupDocId}`)
            );
            const snaps = await db.getAll(...refs);
            snaps.forEach((snap, idx) => {
                if (snap.exists) {
                    existingLookupDocIds.add(chunk[idx].lookupDocId);
                }
            });
        }

        const toInsert = prepared.filter((row) => !existingLookupDocIds.has(row.lookupDocId));
        const skipped = prepared.length - toInsert.length;

        // 2 writes per row (participant + lookupKey) — keep batches under Firestore's 500-op limit.
        const batchSize = 250;
        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const firestoreBatch = db.batch();

            for (const row of batch) {
                const docRef = db.collection(`activities/${activitySlug}/participants`).doc();
                firestoreBatch.set(docRef, {
                    name: row.name,
                    lookup: row.lookup,
                    ...(row.templateKey ? { templateKey: row.templateKey } : {}),
                    additionalFields: row.additionalFields,
                    certificateStatus: 'pending',
                    createdAt: getFieldValue().serverTimestamp(),
                    updatedAt: getFieldValue().serverTimestamp()
                });
                const lookupKeyRef = db.doc(`activities/${activitySlug}/lookupKeys/${row.lookupDocId}`);
                firestoreBatch.set(lookupKeyRef, {
                    participantId: docRef.id,
                    createdAt: getFieldValue().serverTimestamp()
                });
            }

            await firestoreBatch.commit();
            processed += batch.length;
            const percentage = toInsert.length > 0
                ? Math.round((processed / toInsert.length) * 100)
                : 100;
            await progressRef.update({
                processed,
                percentage,
                updatedAt: getFieldValue().serverTimestamp()
            });
        }

        await progressRef.update({
            status: 'completed',
            updatedAt: getFieldValue().serverTimestamp()
        });

        return {
            success: true,
            processed,
            total: prepared.length,
            skipped
        };
    } catch (error) {
        console.error('Error in bulk upload:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        await progressRef.update({
            status: 'failed',
            error: errorMessage,
            updatedAt: getFieldValue().serverTimestamp()
        }).catch(() => {});

        throw new functions.https.HttpsError(
            'internal',
            'Error uploading participants',
            error
        );
    }
    }, 'bulkUploadParticipants')
);

/**
 * Public certificate verification callable.
 * Users provide activitySlug and a lookup value (email, redeem code, or other identifier).
 * Returns only the minimal data needed to render a single certificate.
 */
export const verifyCertificate = withVerifyProtection.https.onCall(
    withMonitoring(async (data, context) => {
        const { activitySlug, lookup: lookupRaw } = data || {};

        if (!activitySlug || typeof activitySlug !== "string") {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "activitySlug is required"
            );
        }

        if (!lookupRaw || typeof lookupRaw !== "string") {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "lookup value is required"
            );
        }

        const trimmed = normalizeLookup(lookupRaw);
        if (trimmed.length < 3 || trimmed.length > 256) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Invalid lookup value"
            );
        }

        try {
            const ip = context?.rawRequest?.ip || "unknown";
            await enforceDurableRateLimit(
                `verify:${ip}:${activitySlug}`,
                VERIFY_RATE_MAX,
                VERIFY_RATE_WINDOW_MS
            );

            const db = getAdmin().firestore();
            const activityDoc = await db.doc(`activities/${activitySlug}`).get();
            if (!activityDoc.exists) {
                return { found: false };
            }
            const activity = activityDoc.data() || {};
            if (String(activity.status || "") !== "active") {
                return { found: false };
            }

            const normalized = trimmed;
            const query = db
                .collection("activities")
                .doc(activitySlug)
                .collection("participants")
                .where("lookup", "==", normalized)
                .limit(2);

            const snapshot = await query.get();

            // Not found or ambiguous -> generic not-found response (no information leak)
            if (snapshot.empty || snapshot.size !== 1) {
                return {
                    found: false
                };
            }

            const doc = snapshot.docs[0];
            const participantData = doc.data() || {};
            const templates = (activity.templates || {}) as Record<string, { url?: string }>;
            const defaultKey = String(activity.defaultTemplateKey || "").trim().toLowerCase();
            const assignedKey = String(participantData.templateKey || "").trim().toLowerCase();

            let resolvedKey = "";
            let templateUrl = "";

            if (assignedKey) {
                // Explicit assignment: must exist — no silent fallback to another design
                if (!templates[assignedKey]?.url) {
                    return { found: false };
                }
                resolvedKey = assignedKey;
                templateUrl = templates[assignedKey].url || "";
            } else if (defaultKey && templates[defaultKey]?.url) {
                resolvedKey = defaultKey;
                templateUrl = templates[defaultKey].url || "";
            } else {
                return { found: false };
            }

            const storedLookup = String(participantData.lookup || "");
            const isEmailFormat = storedLookup.includes("@");

            const response: Record<string, unknown> = {
                id: doc.id,
                name: participantData.name || "",
                certificateStatus: participantData.certificateStatus || "pending",
                additionalFields: participantData.additionalFields || {},
                downloadedAt: participantData.downloadedAt || null,
                lookup: storedLookup,
                templateKey: resolvedKey
            };

            if (isEmailFormat && storedLookup) {
                const [userPart, domainPart] = storedLookup.split("@");
                const maskedUser = userPart.length <= 2
                    ? "*".repeat(userPart.length)
                    : `${userPart.slice(0, 2)}***`;
                response.lookupMasked = domainPart
                    ? `${maskedUser}@${domainPart}`
                    : maskedUser;
            }

            return {
                found: true,
                participant: response,
                templateUrl,
                downloadToken: await issueDownloadToken({
                    activitySlug,
                    participantId: doc.id,
                    exp: now() + 10 * 60_000
                })
            };
        } catch (error: unknown) {
            if (isHttpsError(error)) {
                throw error;
            }
            console.error("Error verifying certificate:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Error verifying certificate"
            );
        }
    }, "verifyCertificate")
);

export const markCertificateDownloaded = withSecrets.https.onCall(
    withMonitoring(async (data) => {
        const { activitySlug, participantId, downloadToken } = data || {};
        if (!activitySlug || !participantId || !downloadToken) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
        }
        const payload = await verifyDownloadToken(downloadToken);
        if (payload.activitySlug !== activitySlug || payload.participantId !== participantId) {
            throw new functions.https.HttpsError('permission-denied', 'Token mismatch');
        }
        await getAdmin().firestore()
            .doc(`activities/${activitySlug}/participants/${participantId}`)
            .set({
                certificateStatus: 'downloaded',
                downloadedAt: getFieldValue().serverTimestamp(),
                updatedAt: getFieldValue().serverTimestamp()
            }, { merge: true });
        return { ok: true };
    }, 'markCertificateDownloaded')
);

export const acceptInvite = fn.https.onCall(
    withMonitoring(async (data, context) => {
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }
        const inviteId = String(data?.inviteId || '');
        if (!inviteId) {
            throw new functions.https.HttpsError('invalid-argument', 'inviteId is required');
        }
        const inviteRef = getAdmin().firestore().doc(`invites/${inviteId}`);
        const inviteDoc = await inviteRef.get();
        if (!inviteDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Invite not found');
        }
        const invite = inviteDoc.data() || {};
        const authEmail = String(context.auth.token.email).toLowerCase().trim();
        const inviteEmail = String(invite.email || '').toLowerCase().trim();
        if (authEmail !== inviteEmail) {
            throw new functions.https.HttpsError('permission-denied', 'Invite email mismatch');
        }
        const expiresAt = Number(invite.expiresAt || 0);
        if (expiresAt && expiresAt < Date.now()) {
            throw new functions.https.HttpsError('permission-denied', 'Invite expired');
        }
        const batch = getAdmin().firestore().batch();
        if (invite.type === 'platform') {
            batch.set(getAdmin().firestore().doc(`admins/${context.auth.uid}`), {
                email: authEmail,
                role: 'platform',
                createdAt: getFieldValue().serverTimestamp()
            }, { merge: true });
        } else if (invite.type === 'manager' && invite.activitySlug) {
            batch.set(
                getAdmin().firestore().doc(`activities/${invite.activitySlug}/managers/${context.auth.uid}`),
                {
                    uid: context.auth.uid,
                    email: authEmail,
                    createdAt: getFieldValue().serverTimestamp(),
                    createdBy: invite.createdBy || 'system'
                },
                { merge: true }
            );
        } else {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid invite type');
        }
        batch.delete(inviteRef);
        await batch.commit();
        await refreshClaimsForUid(context.auth.uid);
        return { ok: true };
    }, 'acceptInvite')
);

export const invitePlatformAdmin = fn.https.onCall(
    withMonitoring(async (data, context) => {
        const role = await getAdminRole(context);
        if (role !== 'super') {
            throw new functions.https.HttpsError('permission-denied', 'Super role required');
        }
        const email = String(data?.email || '').trim().toLowerCase();
        if (!email) throw new functions.https.HttpsError('invalid-argument', 'email is required');
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const ref = await getAdmin().firestore().collection('invites').add({
            email,
            type: 'platform',
            createdBy: context.auth?.uid,
            createdAt: getFieldValue().serverTimestamp(),
            expiresAt
        });
        // Invite is stored only — no email is sent. Share the pending invite with the person.
        return { ok: true, inviteId: ref.id, email, expiresAt };
    }, 'invitePlatformAdmin')
);

export const inviteActivityManager = fn.https.onCall(
    withMonitoring(async (data, context) => {
        await getAdminRole(context);
        const email = String(data?.email || '').trim().toLowerCase();
        const activitySlug = String(data?.activitySlug || '').trim();
        if (!email || !activitySlug) {
            throw new functions.https.HttpsError('invalid-argument', 'email and activitySlug are required');
        }
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const ref = await getAdmin().firestore().collection('invites').add({
            email,
            type: 'manager',
            activitySlug,
            createdBy: context.auth?.uid,
            createdAt: getFieldValue().serverTimestamp(),
            expiresAt
        });
        return { ok: true, inviteId: ref.id, email, activitySlug, expiresAt };
    }, 'inviteActivityManager')
);

export const listPlatformInvites = fn.https.onCall(
    withMonitoring(async (_data, context) => {
        const role = await getAdminRole(context);
        if (role !== 'super' && role !== 'platform') {
            throw new functions.https.HttpsError('permission-denied', 'Admin access required');
        }
        const snap = await getAdmin()
            .firestore()
            .collection('invites')
            .where('type', '==', 'platform')
            .get();
        const invites = snap.docs
            .map((doc) => {
                const data = doc.data() || {};
                return {
                    id: doc.id,
                    email: String(data.email || ''),
                    type: 'platform' as const,
                    createdAt: data.createdAt?.toMillis?.() || Number(data.createdAt) || 0,
                    expiresAt: Number(data.expiresAt || 0)
                };
            })
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return { invites };
    }, 'listPlatformInvites')
);

export const revokeInvite = fn.https.onCall(
    withMonitoring(async (data, context) => {
        const role = await getAdminRole(context);
        const inviteId = String(data?.inviteId || '').trim();
        if (!inviteId) {
            throw new functions.https.HttpsError('invalid-argument', 'inviteId is required');
        }
        const inviteRef = getAdmin().firestore().doc(`invites/${inviteId}`);
        const inviteDoc = await inviteRef.get();
        if (!inviteDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Invite not found');
        }
        const invite = inviteDoc.data() || {};
        if (invite.type === 'platform' && role !== 'super') {
            throw new functions.https.HttpsError('permission-denied', 'Super role required');
        }
        if (invite.type === 'manager') {
            const activitySlug = String(invite.activitySlug || '');
            if (!activitySlug) {
                throw new functions.https.HttpsError('invalid-argument', 'Invalid manager invite');
            }
            await verifyPlatformOrManager(context, activitySlug);
        }
        await inviteRef.delete();
        return { ok: true };
    }, 'revokeInvite')
);

/** Any signed-in user can see invites for their own email (used before they have admin access). */
export const getMyPendingInvites = fn.https.onCall(
    withMonitoring(async (_data, context) => {
        ensureAdmin();
        if (!context.auth?.token?.email) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }
        const authEmail = String(context.auth.token.email).toLowerCase().trim();
        const snap = await getAdmin()
            .firestore()
            .collection('invites')
            .where('email', '==', authEmail)
            .get();
        const now = Date.now();
        const invites = snap.docs
            .map((doc) => {
                const data = doc.data() || {};
                return {
                    id: doc.id,
                    email: String(data.email || ''),
                    type: String(data.type || ''),
                    activitySlug: data.activitySlug ? String(data.activitySlug) : undefined,
                    expiresAt: Number(data.expiresAt || 0)
                };
            })
            .filter((invite) => !invite.expiresAt || invite.expiresAt >= now);
        return { invites };
    }, 'getMyPendingInvites')
);

export const removePlatformAdmin = fn.https.onCall(
    withMonitoring(async (data, context) => {
        const role = await getAdminRole(context);
        if (role !== 'super') {
            throw new functions.https.HttpsError('permission-denied', 'Super role required');
        }
        const uid = String(data?.uid || '');
        if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
        const target = await getAdmin().firestore().doc(`admins/${uid}`).get();
        if (target.data()?.role === 'super') {
            throw new functions.https.HttpsError('permission-denied', 'Cannot remove super admin');
        }
        await getAdmin().firestore().doc(`admins/${uid}`).delete();
        await refreshClaimsForUid(uid);
        return { ok: true };
    }, 'removePlatformAdmin')
);

export const removeActivityManager = fn.https.onCall(
    withMonitoring(async (data, context) => {
        await getAdminRole(context);
        const uid = String(data?.uid || '');
        const activitySlug = String(data?.activitySlug || '');
        if (!uid || !activitySlug) {
            throw new functions.https.HttpsError('invalid-argument', 'uid and activitySlug are required');
        }
        await getAdmin().firestore().doc(`activities/${activitySlug}/managers/${uid}`).delete();
        await refreshClaimsForUid(uid);
        return { ok: true };
    }, 'removeActivityManager')
);

export const getTemplateUploadUrl = withSecrets.https.onCall(
    withMonitoring(async (data, context) => {
        const activitySlug = String(data?.activitySlug || '');
        await verifyPlatformOrManager(context, activitySlug);
        const templateKey = String(data?.templateKey || '').trim().toLowerCase();
        const contentType = String(data?.contentType || 'image/png').toLowerCase();
        const contentLength = Number(data?.contentLength || 0);
        if (!activitySlug || !templateKey) {
            throw new functions.https.HttpsError('invalid-argument', 'activitySlug and templateKey are required');
        }
        if (templateKey === RESERVED_TEMPLATE_KEY) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Design key “default” is reserved. Choose a different name.'
            );
        }
        if (!TEMPLATE_KEY_PATTERN.test(templateKey)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid templateKey format');
        }
        if (contentType !== 'image/png') {
            throw new functions.https.HttpsError('invalid-argument', 'Only image/png uploads are allowed');
        }
        const { bucket, publicDomain, maxUploadBytes } = getR2Config();
        if (!contentLength || contentLength > maxUploadBytes) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                `Upload size exceeds limit (${maxUploadBytes} bytes)`
            );
        }
        const fileName = `templates/${activitySlug}/${templateKey}.png`;
        const client = await getR2Client();
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: fileName,
            ContentType: contentType,
            ContentLength: contentLength
        });
        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
        return {
            uploadUrl,
            objectKey: fileName,
            method: 'PUT',
            headers: {
                'Content-Type': contentType
            },
            maxUploadBytes,
            expiresInSeconds: 300,
            templateUrl: `https://${publicDomain}/${fileName}`
        };
    }, 'getTemplateUploadUrl')
);

export const revalidateActivity = fn.https.onCall(
    withMonitoring(async (data, context) => {
        const activitySlug = String(data?.activitySlug || '');
        await verifyPlatformOrManager(context, activitySlug);
        // Netlify webhook call intentionally handled by Next server action/middleware in app layer.
        return { ok: true };
    }, 'revalidateActivity')
);

