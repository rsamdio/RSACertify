import * as functions from 'firebase-functions/v1';
import { getAdmin, getFieldValue, ensureAdmin } from './admin';
import { statisticsCache, eventConfigCache, getStatisticsCacheKey, getEventConfigCacheKey } from './cache';
import { withMonitoring } from './monitoring';
import { verifyAdmin } from './auth';

/**
 * Get event statistics with caching (uses event doc counters, no participants collection read)
 */
export const getEventStatistics = functions.https.onCall(
    withMonitoring(async (data, context) => {
    await verifyAdmin(context);
    const { eventId } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'eventId is required'
        );
    }
    
    // Check cache first
    const cacheKey = getStatisticsCacheKey(eventId);
    const cached = statisticsCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        const eventDoc = await getAdmin().firestore()
            .doc(`events/${eventId}`)
            .get();
        
        if (!eventDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'Event not found'
            );
        }
        
        const data = eventDoc.data();
        const total = data?.participantsCount ?? 0;
        const downloaded = data?.certificatesCount ?? 0;
        const pending = Math.max(0, total - downloaded);
        const downloadRate = total > 0
            ? ((downloaded / total) * 100).toFixed(1)
            : '0.0';
        
        const stats = {
            total,
            downloaded,
            pending,
            downloadRate
        };
        
        statisticsCache.set(cacheKey, stats);
        return stats;
        
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error('Error getting event statistics:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error getting event statistics',
            error
        );
    }
    }, 'getEventStatistics')
);

/**
 * Get event configuration with caching
 */
export const getEventConfig = functions.https.onCall(
    withMonitoring(async (data, context) => {
    ensureAdmin();
    const { eventId } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'eventId is required'
        );
    }
    
    // Check cache first
    const cacheKey = getEventConfigCacheKey(eventId);
    const cached = eventConfigCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        // Fetch from Firestore
        const eventDoc = await getAdmin().firestore()
            .doc(`events/${eventId}`)
            .get();
        
        if (!eventDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'Event not found'
            );
        }
        
        const config = eventDoc.data();
        
        // Cache the result
        eventConfigCache.set(cacheKey, config);
        
        return config;
        
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error('Error getting event config:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error getting event configuration',
            error
        );
        }
    }, 'getEventConfig')
);

/**
 * One-time migration function to populate initial counters for existing events
 * Can be called from admin dashboard to migrate existing data
 */
export const migrateCounters = functions.https.onCall(
    withMonitoring(async (data, context) => {
        await verifyAdmin(context);
        try {
            const db = getAdmin().firestore();
            const eventsSnapshot = await db.collection('events').get();
            
            if (eventsSnapshot.size === 0) {
                return { 
                    success: true, 
                    message: 'No events found to migrate',
                    processed: 0 
                };
            }
            
            let processed = 0;
            let errors = 0;
            const results: any[] = [];
            
            // Process each event
            for (const eventDoc of eventsSnapshot.docs) {
                try {
                    const eventId = eventDoc.id;
                    
                    // Get all participants for this event
                    const participantsSnapshot = await db
                        .collection('events')
                        .doc(eventId)
                        .collection('participants')
                        .get();
                    
                    const totalParticipants = participantsSnapshot.size;
                    
                    // Count downloaded certificates
                    let downloadedCount = 0;
                    participantsSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.certificateStatus === 'downloaded') {
                            downloadedCount++;
                        }
                    });
                    
                    // Update event document with counts
                    await db.collection('events').doc(eventId).update({
                        participantsCount: totalParticipants,
                        certificatesCount: downloadedCount,
                        updatedAt: getFieldValue().serverTimestamp()
                    });
                    
                    results.push({
                        eventId,
                        participants: totalParticipants,
                        certificates: downloadedCount
                    });
                    
                    processed++;
                    
                } catch (error: any) {
                    console.error(`Error processing event ${eventDoc.id}:`, error);
                    errors++;
                    results.push({
                        eventId: eventDoc.id,
                        error: error.message
                    });
                }
            }
            
            return {
                success: true,
                processed,
                errors,
                total: eventsSnapshot.size,
                results
            };
            
        } catch (error: any) {
            console.error('Migration failed:', error);
            throw new functions.https.HttpsError(
                'internal',
                'Error migrating counters',
                error
            );
        }
    }, 'migrateCounters')
);

