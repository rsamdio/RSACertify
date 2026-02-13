/**
 * One-time migration script to populate initial counters for existing events
 * 
 * This script should be run once before deploying the counter functions.
 * It calculates and sets participantsCount and certificatesCount for all events.
 * 
 * Usage:
 *  1. Build the functions: npm run build
 *  2. Run: node lib/scripts/migrateCounters.js
 * 
 * Or use Firebase Admin SDK directly:
 *  firebase functions:shell
 *  > migrateCounters()
 */

import * as admin from 'firebase-admin';

// Initialize admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Migrate counters for all events
 */
export async function migrateCounters(): Promise<void> {
    console.log('Starting counter migration...');
    
    try {
        // Get all events
        const eventsSnapshot = await db.collection('events').get();
        console.log(`Found ${eventsSnapshot.size} events to process`);
        
        let processed = 0;
        let errors = 0;
        
        // Process each event
        for (const eventDoc of eventsSnapshot.docs) {
            try {
                const eventId = eventDoc.id;
                console.log(`Processing event: ${eventId}`);
                
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
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`  ✓ Event ${eventId}: ${totalParticipants} participants, ${downloadedCount} certificates`);
                processed++;
                
            } catch (error) {
                console.error(`  ✗ Error processing event ${eventDoc.id}:`, error);
                errors++;
            }
        }
        
        console.log(`\nMigration complete!`);
        console.log(`  Processed: ${processed}`);
        console.log(`  Errors: ${errors}`);
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrateCounters()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

