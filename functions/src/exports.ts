import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { withMonitoring } from './monitoring';

/**
 * Export participants to CSV with Cloud Storage upload
 */
export const exportParticipantsCSV = functions.https.onCall(
    withMonitoring(async (data, context) => {
    // Verify authentication
    if (!context || !context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to export participants'
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
    
    const { eventId } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'eventId is required'
        );
    }
    
    try {
        // Get event data for field configuration
        const eventDoc = await admin.firestore()
            .doc(`events/${eventId}`)
            .get();
        
        if (!eventDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'Event not found'
            );
        }
        
        const eventData = eventDoc.data();
        const participantFields = eventData?.participantFields || [];
        
        // Get all participants
        const participantsSnapshot = await admin.firestore()
            .collection(`events/${eventId}/participants`)
            .get();
        
        // Build CSV headers
        const baseHeaders = ['Name', 'Email', 'Certificate Status', 'Downloaded At', 'Created At', 'Updated At'];
        const customHeaders = participantFields.map((field: any) => field.label || field.key);
        const headers = [...baseHeaders, ...customHeaders];
        
        // Build CSV rows
        const csvRows: string[] = [];
        csvRows.push(headers.map(h => escapeCSVField(h)).join(','));
        
        participantsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const row: string[] = [
                data.name || '',
                data.email || '',
                data.certificateStatus || 'pending',
                data.downloadedAt ? formatTimestamp(data.downloadedAt) : '',
                data.createdAt ? formatTimestamp(data.createdAt) : '',
                data.updatedAt ? formatTimestamp(data.updatedAt) : ''
            ];
            
            // Add custom fields
            participantFields.forEach((field: any) => {
                const fieldKey = field.key;
                let value = '';
                
                if (data.additionalFields && data.additionalFields[fieldKey]) {
                    value = data.additionalFields[fieldKey];
                } else if (data[fieldKey]) {
                    value = data[fieldKey];
                }
                
                row.push(value);
            });
            
            csvRows.push(row.map(field => escapeCSVField(field)).join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        // Upload to Cloud Storage
        const bucket = admin.storage().bucket();
        const fileName = `exports/${eventId}/${Date.now()}_participants.csv`;
        const file = bucket.file(fileName);
        
        await file.save(csvContent, {
            metadata: {
                contentType: 'text/csv',
                cacheControl: 'public, max-age=3600',
                metadata: {
                    eventId: eventId,
                    exportedBy: context.auth.uid,
                    exportedAt: new Date().toISOString()
                }
            }
        });
        
        // Generate signed URL (valid for 1 hour)
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 3600000 // 1 hour
        });
        
        return {
            success: true,
            downloadUrl: url,
            fileName: fileName,
            recordCount: participantsSnapshot.size
        };
        
    } catch (error) {
        console.error('Error exporting participants:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error exporting participants',
            error
        );
    }
    }, 'exportParticipantsCSV')
);

/**
 * Escape CSV field to handle commas, quotes, and newlines
 */
function escapeCSVField(field: any): string {
    if (field === null || field === undefined) {
        return '';
    }
    
    const str = String(field);
    
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

/**
 * Format Firestore timestamp to readable string
 */
function formatTimestamp(timestamp: any): string {
    if (!timestamp) return '';
    
    let date: Date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }
    
    return date.toISOString();
}

