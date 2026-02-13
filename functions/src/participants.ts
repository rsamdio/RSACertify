import * as functions from 'firebase-functions/v1';
import { getAdmin, getFieldValue } from './admin';
import { withMonitoring } from './monitoring';
import { verifyAdmin } from './auth';

/**
 * Search participants with admin authentication and pagination
 */
export const searchParticipants = functions.https.onCall(
    withMonitoring(async (data, context) => {
    await verifyAdmin(context);
    const { eventId, query, limit = 50, startAfter } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'eventId is required'
        );
    }
    
    if (!query || query.length < 2) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Query must be at least 2 characters'
        );
    }
    
    try {
        // Firestore search
        let firestoreQuery = getAdmin().firestore()
            .collection(`events/${eventId}/participants`)
            .where('name', '>=', query)
            .where('name', '<=', query + '\uf8ff')
            .limit(limit);
        
        // Add pagination if startAfter is provided
        if (startAfter) {
            const startAfterDoc = await getAdmin().firestore()
                .doc(`events/${eventId}/participants/${startAfter}`)
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
 * Bulk upload participants with progress tracking
 */
export const bulkUploadParticipants = functions.https.onCall(
    withMonitoring(async (data, context) => {
    await verifyAdmin(context);
    
    const { eventId, participants } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'eventId is required'
        );
    }
    
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'participants array is required and must not be empty'
        );
    }
    
    // Enforce upper bound on participants per call to prevent abuse
    const maxParticipantsPerCall = 5000;
    if (participants.length > maxParticipantsPerCall) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            `Too many participants in a single upload. Maximum allowed is ${maxParticipantsPerCall}.`
        );
    }
    
    const batchSize = 500; // Firestore limit
    let processed = 0;
    const progressRef = getAdmin().database().ref(`bulkUploads/${context.auth!.uid}/progress`);
    
    try {
        // Initialize progress
        await progressRef.set({
            processed: 0,
            total: participants.length,
            percentage: 0,
            status: 'processing'
        });
        
        for (let i = 0; i < participants.length; i += batchSize) {
            const batch = participants.slice(i, i + batchSize);
            const firestoreBatch = getAdmin().firestore().batch();
            
            batch.forEach(participant => {
                // Basic field length validation to avoid oversized entries
                const safeName = typeof participant.name === 'string'
                    ? participant.name.trim().slice(0, 200)
                    : '';
                const rawEmail = typeof participant.email === 'string'
                    ? participant.email.trim().toLowerCase()
                    : '';
                const safeEmail = rawEmail.slice(0, 254); // typical email length limit

                if (!safeEmail && !safeName) {
                    return;
                }

                const docRef = getAdmin().firestore()
                    .collection(`events/${eventId}/participants`)
                    .doc();
                
                firestoreBatch.set(docRef, {
                    ...participant,
                    name: safeName,
                    email: safeEmail,
                    createdAt: getFieldValue().serverTimestamp(),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            });
            
            await firestoreBatch.commit();
            processed += batch.length;
            
            // Update progress
            const percentage = Math.round((processed / participants.length) * 100);
            await progressRef.update({
                processed,
                percentage,
                lastUpdate: Date.now()
            });
        }
        
        // Mark as complete
        await progressRef.update({
            status: 'completed',
            completedAt: Date.now()
        });
        
        return {
            success: true,
            processed,
            total: participants.length
        };
        
    } catch (error) {
        console.error('Error in bulk upload:', error);
        
        // Mark as failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        await progressRef.update({
            status: 'failed',
            error: errorMessage,
            failedAt: Date.now()
        }).catch(() => {}); // Ignore errors updating progress
        
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
 * Users provide eventId and a redeem value (email or redeem code).
 * The email field serves dual purpose - it stores either an email address OR a redeem code.
 * Returns only the minimal data needed to render a single certificate.
 */
export const verifyCertificate = functions.https.onCall(
    withMonitoring(async (data, context) => {
        const { eventId, redeem } = data || {};

        if (!eventId || typeof eventId !== 'string') {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'eventId is required'
            );
        }

        if (!redeem || typeof redeem !== 'string') {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'redeem value (email or code) is required'
            );
        }

        const trimmed = redeem.trim();
        if (trimmed.length < 3 || trimmed.length > 256) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Invalid redeem value'
            );
        }

        try {
            const db = getAdmin().firestore();
            const normalized = trimmed.toLowerCase();

            // Simple lookup: email field serves dual purpose (email OR redeem code)
            // All participant lookups use the email field, normalized to lowercase for case-insensitive matching
            const query = db
                .collection('events')
                .doc(eventId)
                .collection('participants')
                .where('email', '==', normalized)
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

            // Check if the stored value looks like an email for masking purposes
            const storedEmail = String(participantData.email || '');
            const isEmailFormat = storedEmail.includes('@');

            // Prepare minimal safe payload for client
            const response: any = {
                id: doc.id,
                name: participantData.name || '',
                certificateStatus: participantData.certificateStatus || 'pending',
                // Optional fields used by certificate templates
                additionalFields: participantData.additionalFields || {},
                downloadedAt: participantData.downloadedAt || null,
            };

            // Optionally include masked email (only if stored value is email format)
            if (isEmailFormat && storedEmail) {
                const [userPart, domainPart] = storedEmail.split('@');
                const maskedUser = userPart.length <= 2
                    ? '*'.repeat(userPart.length)
                    : `${userPart.slice(0, 2)}***`;
                response.emailMasked = domainPart
                    ? `${maskedUser}@${domainPart}`
                    : maskedUser;
            }

            return {
                found: true,
                participant: response
            };

        } catch (error: any) {
            console.error('Error verifying certificate:', error?.message || error);
            throw new functions.https.HttpsError(
                'internal',
                'Error verifying certificate'
            );
        }
    }, 'verifyCertificate')
);

