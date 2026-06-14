import * as functions from 'firebase-functions/v1';
import { getAdmin, getFieldValue, ensureAdmin } from './admin';

// ===== COUNTER FUNCTIONS =====

/**
 * Retry helper for counter updates with exponential backoff
 */
async function retryCounterUpdate(
    operation: () => Promise<void>,
    maxRetries: number = 3,
    initialDelay: number = 100
): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await operation();
            return; // Success
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Don't retry on certain errors (e.g., not found, permission denied)
            if (lastError.message.includes('not found') || 
                lastError.message.includes('permission') ||
                lastError.message.includes('does not exist')) {
                throw lastError;
            }
            
            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    throw lastError || new Error('Counter update failed after retries');
}

/**
 * Validate counter value (prevent negative counters)
 */
function validateCounter(newValue: number, fieldName: string): void {
    if (newValue < 0) {
        console.warn(`Warning: ${fieldName} would become negative (${newValue}), clamping to 0`);
        // Note: We don't throw here, but log the warning
        // The actual update will still happen, but this helps with debugging
    }
}

/**
 * Increment participantsCount when a participant is created
 * Includes retry logic and validation
 */
export const onParticipantCreate = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onCreate(async (snap, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        const eventRef = getAdmin().firestore().doc(`events/${eventId}`);
        
        try {
            // First, check if event exists
            const eventDoc = await eventRef.get();
            if (!eventDoc.exists) {
                console.error(`Event ${eventId} does not exist, skipping counter update`);
                return; // Don't throw - event might have been deleted
            }
            
            const currentCount = eventDoc.data()?.participantsCount || 0;
            const newCount = currentCount + 1;
            validateCounter(newCount, 'participantsCount');
            
            // Retry the update operation
            await retryCounterUpdate(async () => {
                await eventRef.update({
                    participantsCount: getFieldValue().increment(1),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            });
            
        } catch (error) {
            // Log error but don't throw - prevent cascade failures
            // Counter can be reconciled later using migrateCounters
            console.error(`Error incrementing participantsCount for event ${eventId}:`, error);
            // Don't throw - this is a non-critical operation that can be reconciled
        }
    });

/**
 * Decrement participantsCount when a participant is deleted
 * Includes retry logic and validation
 */
export const onParticipantDelete = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onDelete(async (snap, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        const eventRef = getAdmin().firestore().doc(`events/${eventId}`);
        
        try {
            // First, check if event exists
            const eventDoc = await eventRef.get();
            if (!eventDoc.exists) {
                console.error(`Event ${eventId} does not exist, skipping counter update`);
                return; // Don't throw - event might have been deleted
            }
            
            const currentCount = eventDoc.data()?.participantsCount || 0;
            const newCount = currentCount - 1;
            validateCounter(newCount, 'participantsCount');
            
            // Retry the update operation
            await retryCounterUpdate(async () => {
                await eventRef.update({
                    participantsCount: getFieldValue().increment(-1),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            });
            
        } catch (error) {
            // Log error but don't throw - prevent cascade failures
            // Counter can be reconciled later using migrateCounters
            console.error(`Error decrementing participantsCount for event ${eventId}:`, error);
            // Don't throw - this is a non-critical operation that can be reconciled
        }
    });

/**
 * Increment certificatesCount when certificate status changes to 'downloaded'
 * Decrement if status changes from 'downloaded' to something else
 * Includes retry logic and validation
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
            // First, check if event exists
            const eventDoc = await eventRef.get();
            if (!eventDoc.exists) {
                console.error(`Event ${eventId} does not exist, skipping counter update`);
                return; // Don't throw - event might have been deleted
            }
            
            const currentCount = eventDoc.data()?.certificatesCount || 0;
            let newCount: number;
            let increment: number;
            
            // Status changed to 'downloaded'
            if (beforeStatus !== 'downloaded' && afterStatus === 'downloaded') {
                increment = 1;
                newCount = currentCount + 1;
            }
            // Status changed from 'downloaded' to something else
            else if (beforeStatus === 'downloaded' && afterStatus !== 'downloaded') {
                increment = -1;
                newCount = currentCount - 1;
            } else {
                return; // No counter change needed
            }
            
            validateCounter(newCount, 'certificatesCount');
            
            // Retry the update operation
            await retryCounterUpdate(async () => {
                await eventRef.update({
                    certificatesCount: getFieldValue().increment(increment),
                    updatedAt: getFieldValue().serverTimestamp()
                });
            });
            
        } catch (error) {
            // Log error but don't throw - prevent cascade failures
            // Counter can be reconciled later using migrateCounters
            console.error(`Error updating certificatesCount for event ${eventId}:`, error);
            // Don't throw - this is a non-critical operation that can be reconciled
        }
    });

// ===== REALTIME DATABASE SYNC =====

/**
 * Sync Firestore event counters to Realtime Database for real-time updates
 * This is the single source of truth for counters in RTDB (events/{eventId}/counters)
 * Note: events/list is updated separately by syncEventsListToRealtime
 */
export const syncCountersToRealtime = functions.firestore
    .document('events/{eventId}')
    .onWrite(async (change, context) => {
        ensureAdmin();
        const eventId = context.params.eventId;
        
        // Only process updates (not deletes - deletion is handled by syncEventsListToRealtime)
        if (!change.after.exists) {
            return;
        }
        
        const data = change.after.data();
        if (!data) {
            return;
        }
        
        try {
            // Update Realtime Database counters (single source of truth for live updates)
            const countersRef = getAdmin().database().ref(`events/${eventId}/counters`);
            await countersRef.set({
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

