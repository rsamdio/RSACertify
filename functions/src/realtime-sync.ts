import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { withMonitoring } from './monitoring';

/**
 * Sync event metadata to Realtime Database for fast reads
 * Stores lightweight metadata: title, date, participantsCount, certificatesCount, updatedAt, createdAt
 */
export const syncEventMetadataToRealtime = functions.firestore
    .document('events/{eventId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            
            try {
                const realtimeRef = admin.database().ref(`events/${eventId}/meta`);
                
                // If document was deleted, remove entire event path from Realtime DB
                if (!change.after.exists) {
                    // Remove the entire event path to clean up all related data
                    const eventPathRef = admin.database().ref(`events/${eventId}`);
                    await eventPathRef.remove();
                    console.log(`Removed entire event path from Realtime Database for event ${eventId}`);
                    return;
                }
                
                // Document was created or updated
                const data = change.after.data();
                
                if (!data) {
                    console.warn(`Event data is undefined for ${eventId}`);
                    return;
                }
                
                // Sync lightweight metadata to Realtime DB
                const metadata = {
                    title: data.title || '',
                    date: data.date || '',
                    participantsCount: data.participantsCount || 0,
                    certificatesCount: data.certificatesCount || 0,
                    updatedAt: data.updatedAt?.toMillis() || Date.now(),
                    createdAt: data.createdAt?.toMillis() || Date.now()
                };
                
                await realtimeRef.set(metadata);
                console.log(`Synced event metadata to Realtime Database for event ${eventId}`);
                
            } catch (error) {
                console.error(`Error syncing event metadata to Realtime Database for event ${eventId}:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncEventMetadataToRealtime')
    );

/**
 * Sync admins list to Realtime Database
 * Maintains a list of all admins for fast reads
 */
export const syncAdminsToRealtime = functions.firestore
    .document('admins/{adminId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const adminId = context.params.adminId;
            
            try {
                const adminsListRef = admin.database().ref('admins/list');
                
                // Get current list
                const snapshot = await adminsListRef.once('value');
                let adminsList: any[] = snapshot.val() || [];
                
                if (!change.after.exists) {
                    // Admin was deleted - remove from list
                    adminsList = adminsList.filter((admin: any) => admin.id !== adminId);
                } else {
                    // Admin was created or updated
                    const adminData = change.after.data();
                    if (adminData) {
                        const adminEntry = {
                            id: adminId,
                            email: adminData.email || '',
                            createdAt: adminData.createdAt?.toMillis() || Date.now()
                        };
                        
                        // Find and update or add
                        const index = adminsList.findIndex((a: any) => a.id === adminId);
                        if (index >= 0) {
                            adminsList[index] = adminEntry;
                        } else {
                            adminsList.push(adminEntry);
                        }
                    }
                }
                
                // Sort by createdAt descending
                adminsList.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
                
                await adminsListRef.set(adminsList);
                console.log(`Synced admins list to Realtime Database (${adminsList.length} admins)`);
                
            } catch (error) {
                console.error(`Error syncing admins list to Realtime Database:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncAdminsToRealtime')
    );

/**
 * Sync invites list to Realtime Database
 * Maintains a list of all invites for fast reads
 */
export const syncInvitesToRealtime = functions.firestore
    .document('invites/{inviteId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const inviteId = context.params.inviteId;
            
            try {
                const invitesListRef = admin.database().ref('invites/list');
                
                // Get current list
                const snapshot = await invitesListRef.once('value');
                let invitesList: any[] = snapshot.val() || [];
                
                if (!change.after.exists) {
                    // Invite was deleted - remove from list
                    invitesList = invitesList.filter((invite: any) => invite.id !== inviteId);
                } else {
                    // Invite was created or updated
                    const inviteData = change.after.data();
                    if (inviteData) {
                        const inviteEntry = {
                            id: inviteId,
                            email: inviteId, // Invite ID is the email
                            createdAt: inviteData.createdAt?.toMillis() || Date.now()
                        };
                        
                        // Find and update or add
                        const index = invitesList.findIndex((i: any) => i.id === inviteId);
                        if (index >= 0) {
                            invitesList[index] = inviteEntry;
                        } else {
                            invitesList.push(inviteEntry);
                        }
                    }
                }
                
                // Sort by createdAt descending
                invitesList.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
                
                await invitesListRef.set(invitesList);
                console.log(`Synced invites list to Realtime Database (${invitesList.length} invites)`);
                
            } catch (error) {
                console.error(`Error syncing invites list to Realtime Database:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncInvitesToRealtime')
    );

/**
 * Sync participant changes to Realtime Database for live updates
 * Writes change notifications to events/{eventId}/participants/changes/{changeId}
 */
export const syncParticipantChangesToRealtime = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            const participantId = context.params.participantId;
            
            try {
                const changesRef = admin.database()
                    .ref(`events/${eventId}/participants/changes`)
                    .push();
                
                let changeType: string;
                let changeData: any = {
                    participantId,
                    timestamp: Date.now()
                };
                
                if (!change.after.exists) {
                    // Participant was deleted
                    changeType = 'deleted';
                    const beforeData = change.before.data();
                    if (beforeData) {
                        changeData.fields = {
                            name: beforeData.name,
                            email: beforeData.email,
                            certificateStatus: beforeData.certificateStatus
                        };
                    }
                } else if (!change.before.exists) {
                    // Participant was created
                    changeType = 'added';
                    const afterData = change.after.data();
                    if (afterData) {
                        changeData.fields = {
                            name: afterData.name,
                            email: afterData.email,
                            certificateStatus: afterData.certificateStatus
                        };
                    }
                } else {
                    // Participant was updated
                    changeType = 'updated';
                    const beforeData = change.before.data();
                    const afterData = change.after.data();
                    
                    // Track which fields changed
                    const changedFields: any = {};
                    if (beforeData && afterData) {
                        if (beforeData.name !== afterData.name) changedFields.name = afterData.name;
                        if (beforeData.email !== afterData.email) changedFields.email = afterData.email;
                        if (beforeData.certificateStatus !== afterData.certificateStatus) {
                            changedFields.certificateStatus = afterData.certificateStatus;
                        }
                    }
                    
                    changeData.fields = changedFields;
                }
                
                changeData.type = changeType;
                
                await changesRef.set(changeData);
                console.log(`Synced participant change to Realtime Database: ${changeType} for ${participantId} in event ${eventId}`);
                
            } catch (error) {
                console.error(`Error syncing participant change to Realtime Database for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncParticipantChangesToRealtime')
    );

/**
 * Sync participant metadata index to Realtime Database
 * Maintains lightweight index: name, email, certificateStatus, updatedAt
 */
export const syncParticipantIndexToRealtime = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            const participantId = context.params.participantId;
            
            try {
                const indexRef = admin.database()
                    .ref(`events/${eventId}/participants/index/${participantId}`);
                
                if (!change.after.exists) {
                    // Participant was deleted - remove from index
                    await indexRef.remove();
                    console.log(`Removed participant from index: ${participantId} in event ${eventId}`);
                    return;
                }
                
                // Participant was created or updated
                const participantData = change.after.data();
                if (!participantData) {
                    console.warn(`Participant data is undefined for ${participantId} in event ${eventId}`);
                    return;
                }
                
                // Sync lightweight index data
                const indexData = {
                    name: participantData.name || '',
                    email: participantData.email || '',
                    certificateStatus: participantData.certificateStatus || 'pending',
                    updatedAt: participantData.updatedAt?.toMillis() || Date.now()
                };
                
                await indexRef.set(indexData);
                console.log(`Synced participant index to Realtime Database: ${participantId} in event ${eventId}`);
                
            } catch (error) {
                console.error(`Error syncing participant index to Realtime Database for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncParticipantIndexToRealtime')
    );

/**
 * Sync participant search index to Realtime Database
 * Maintains searchable text: name + email + additionalFields
 */
export const syncParticipantSearchIndex = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            const participantId = context.params.participantId;
            
            try {
                const searchRef = admin.database()
                    .ref(`events/${eventId}/search/${participantId}`);
                
                if (!change.after.exists) {
                    // Participant was deleted - remove from search index
                    await searchRef.remove();
                    console.log(`Removed participant from search index: ${participantId} in event ${eventId}`);
                    return;
                }
                
                // Participant was created or updated
                const participantData = change.after.data();
                if (!participantData) {
                    console.warn(`Participant data is undefined for ${participantId} in event ${eventId}`);
                    return;
                }
                
                // Build searchable text
                const searchParts: string[] = [];
                if (participantData.name) searchParts.push(participantData.name.toLowerCase());
                if (participantData.email) searchParts.push(participantData.email.toLowerCase());
                
                // Add additional fields to search text
                if (participantData.additionalFields) {
                    Object.values(participantData.additionalFields).forEach((value: any) => {
                        if (value && typeof value === 'string') {
                            searchParts.push(value.toLowerCase());
                        }
                    });
                }
                
                const searchText = searchParts.join(' ');
                
                // Sync search index
                const searchData = {
                    searchText,
                    participantId
                };
                
                await searchRef.set(searchData);
                console.log(`Synced participant search index to Realtime Database: ${participantId} in event ${eventId}`);
                
            } catch (error) {
                console.error(`Error syncing participant search index to Realtime Database for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncParticipantSearchIndex')
    );

/**
 * Sync participant change log to Realtime Database
 * Maintains audit trail of significant field changes
 */
export const syncParticipantChangeLog = functions.firestore
    .document('events/{eventId}/participants/{participantId}')
    .onUpdate(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            const participantId = context.params.participantId;
            
            try {
                const before = change.before.data();
                const after = change.after.data();
                
                if (!before || !after) {
                    return;
                }
                
                // Track significant field changes
                const changes: any[] = [];
                
                // Check name changes
                if (before.name !== after.name) {
                    changes.push({
                        field: 'name',
                        oldValue: before.name || '',
                        newValue: after.name || ''
                    });
                }
                
                // Check email changes
                if (before.email !== after.email) {
                    changes.push({
                        field: 'email',
                        oldValue: before.email || '',
                        newValue: after.email || ''
                    });
                }
                
                // Check certificate status changes
                if (before.certificateStatus !== after.certificateStatus) {
                    changes.push({
                        field: 'certificateStatus',
                        oldValue: before.certificateStatus || 'pending',
                        newValue: after.certificateStatus || 'pending'
                    });
                }
                
                // Only log if there are significant changes
                if (changes.length === 0) {
                    return;
                }
                
                // Log each change
                const changeLogRef = admin.database()
                    .ref(`events/${eventId}/changes`)
                    .push();
                
                const logEntry = {
                    participantId,
                    changes,
                    timestamp: Date.now(),
                    userId: after.updatedBy || 'system' // If you track who made the change
                };
                
                await changeLogRef.set(logEntry);
                console.log(`Logged ${changes.length} changes for participant ${participantId} in event ${eventId}`);
                
                // Limit change log to last 1000 entries per event (optional cleanup)
                // This could be done periodically, not on every change
                
            } catch (error) {
                console.error(`Error logging participant changes for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical logging operation
            }
        }, 'syncParticipantChangeLog')
    );

