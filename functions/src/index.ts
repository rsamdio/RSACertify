import * as functions from 'firebase-functions/v1';
import { getAdmin, getFieldValue, ensureAdmin } from './admin';

// ===== COUNTER FUNCTIONS =====

/**
 * Increment participantsCount when a participant is created
 */
export const onParticipantCreate = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onCreate(async (snap, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        const eventRef = getAdmin().firestore().doc(`events/${eventId}`);
        
        try {
            await eventRef.update({
                participantsCount: getFieldValue().increment(1),
                updatedAt: getFieldValue().serverTimestamp()
            });
        } catch (error) {
            console.error(`Error incrementing participantsCount for event ${eventId}:`, error);
            throw error;
        }
    });

/**
 * Decrement participantsCount when a participant is deleted
 */
export const onParticipantDelete = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onDelete(async (snap, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        const eventRef = getAdmin().firestore().doc(`events/${eventId}`);
        
        try {
            await eventRef.update({
                participantsCount: getFieldValue().increment(-1),
                updatedAt: getFieldValue().serverTimestamp()
            });
        } catch (error) {
            console.error(`Error decrementing participantsCount for event ${eventId}:`, error);
            throw error;
        }
    });

/**
 * Increment certificatesCount when certificate status changes to 'downloaded'
 * Decrement if status changes from 'downloaded' to something else
 */
export const onCertificateDownload = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onUpdate(async (change, context) => {
        ensureAdmin();
        const before = change.before.data();
        const after = change.after.data();
        const eventId = context.params.eventId;
        const eventRef = getAdmin().firestore().doc(`events/${eventId}`);
        
        const beforeStatus = before.certificateStatus || 'pending';
        const afterStatus = after.certificateStatus || 'pending';
        
        // Only update if status actually changed
        if (beforeStatus === afterStatus) {
            return;
        }
        
        try {
            // Status changed to 'downloaded'
            if (beforeStatus !== 'downloaded' && afterStatus === 'downloaded') {
                await eventRef.update({
                    certificatesCount: getFieldValue().increment(1),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            }
            else if (beforeStatus === 'downloaded' && afterStatus !== 'downloaded') {
                await eventRef.update({
                    certificatesCount: getFieldValue().increment(-1),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            }
        } catch (error) {
            console.error(`Error updating certificatesCount for event ${eventId}:`, error);
            throw error;
        }
    });

// ===== REALTIME DATABASE SYNC =====

/**
 * Sync Firestore event counters to Realtime Database for real-time updates
 */
export const syncCountersToRealtime = functions.firestore
    .document('events/{eventId}')
    .onUpdate(async (change, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        const data = change.after.data();
        
        try {
            // Update Realtime Database counters
            const realtimeRef = getAdmin().database().ref(`events/${eventId}/counters`);
            await realtimeRef.update({
                participants: data.participantsCount || 0,
                certificates: data.certificatesCount || 0,
                updatedAt: Date.now()
            });
        } catch (error) {
            console.error(`Error syncing counters to Realtime Database for event ${eventId}:`, error);
            // Don't throw - this is a non-critical sync operation
        }
    });

// Export functions from other modules
export * from './participants';
export * from './exports';
export * from './events';
export * from './realtime-sync';

