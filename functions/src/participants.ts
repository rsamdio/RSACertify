import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { withMonitoring } from './monitoring';

/**
 * Search participants with admin authentication and pagination
 */
export const searchParticipants = functions.https.onCall(
    withMonitoring(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to search participants'
        );
    }
    
    // Verify admin access
    try {
        const adminDoc = await admin.firestore()
            .doc(`admins/${context.auth.uid}`)
            .get();
        
        if (!adminDoc.exists) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Admin access required'
            );
        }
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            'Error verifying admin access'
        );
    }
    
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
        let firestoreQuery = admin.firestore()
            .collection(`events/${eventId}/participants`)
            .where('name', '>=', query)
            .where('name', '<=', query + '\uf8ff')
            .limit(limit);
        
        // Add pagination if startAfter is provided
        if (startAfter) {
            const startAfterDoc = await admin.firestore()
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
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to upload participants'
        );
    }
    
    // Verify admin access
    try {
        const adminDoc = await admin.firestore()
            .doc(`admins/${context.auth.uid}`)
            .get();
        
        if (!adminDoc.exists) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Admin access required'
            );
        }
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            'Error verifying admin access'
        );
    }
    
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
    
    const batchSize = 500; // Firestore limit
    let processed = 0;
    const progressRef = admin.database().ref(`bulkUploads/${context.auth.uid}/progress`);
    
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
            const firestoreBatch = admin.firestore().batch();
            
            batch.forEach(participant => {
                const docRef = admin.firestore()
                    .collection(`events/${eventId}/participants`)
                    .doc();
                
                firestoreBatch.set(docRef, {
                    ...participant,
                    email: (participant.email || '').toLowerCase(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

