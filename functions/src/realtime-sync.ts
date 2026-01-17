import * as functions from 'firebase-functions/v1';
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
                    return;
                }
                
                // Document was created or updated
                const data = change.after.data();
                
                if (!data) {
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
                
            } catch (error) {
                console.error(`Error syncing participant change to Realtime Database for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncParticipantChangesToRealtime')
    );

/**
 * Sync participant metadata index to Realtime Database
 * Maintains index: name, email, certificateStatus, updatedAt, additionalFields
 * Includes additionalFields to avoid Firestore reads for custom fields display
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
                    return;
                }
                
                // Participant was created or updated
                const participantData = change.after.data();
                if (!participantData) {
                    return;
                }
                
                // Sync index data including additionalFields for custom fields
                const indexData: any = {
                    name: participantData.name || '',
                    email: participantData.email || '',
                    certificateStatus: participantData.certificateStatus || 'pending',
                    updatedAt: participantData.updatedAt?.toMillis() || Date.now()
                };
                
                // Include additionalFields if they exist (for custom fields display)
                if (participantData.additionalFields && Object.keys(participantData.additionalFields).length > 0) {
                    indexData.additionalFields = participantData.additionalFields;
                }
                
                await indexRef.set(indexData);
                
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
                    return;
                }
                
                // Participant was created or updated
                const participantData = change.after.data();
                if (!participantData) {
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
                
                // Sync search index (include email for exact matching)
                const searchData = {
                    searchText,
                    participantId,
                    email: participantData.email ? participantData.email.toLowerCase() : ''
                };
                
                await searchRef.set(searchData);
                
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
                
            } catch (error) {
                console.error(`Error logging participant changes for ${participantId} in event ${eventId}:`, error);
                // Don't throw - this is a non-critical logging operation
            }
        }, 'syncParticipantChangeLog')
    );

/**
 * Sync events list to Realtime Database
 * Maintains a list of all events for fast admin dashboard loading
 */
export const syncEventsListToRealtime = functions.firestore
    .document('events/{eventId}')
    .onWrite(
        withMonitoring(async (change, context) => {
            const eventId = context.params.eventId;
            
            try {
                const eventsListRef = admin.database().ref('events/list');
                
                // Get current list
                const snapshot = await eventsListRef.once('value');
                let eventsList: any[] = snapshot.val() || [];
                
                if (!change.after.exists) {
                    // Event was deleted - remove from list
                    eventsList = eventsList.filter((event: any) => event.id !== eventId);
                } else {
                    // Event was created or updated
                    const eventData = change.after.data();
                    if (eventData) {
                        const eventEntry = {
                            id: eventId,
                            title: eventData.title || '',
                            date: eventData.date || '',
                            participantsCount: eventData.participantsCount || 0,
                            certificatesCount: eventData.certificatesCount || 0,
                            updatedAt: eventData.updatedAt?.toMillis() || Date.now(),
                            createdAt: eventData.createdAt?.toMillis() || Date.now()
                        };
                        
                        // Find and update or add
                        const index = eventsList.findIndex((e: any) => e.id === eventId);
                        if (index >= 0) {
                            eventsList[index] = eventEntry;
                        } else {
                            eventsList.push(eventEntry);
                        }
                    }
                }
                
                // Sort by updatedAt descending
                eventsList.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
                
                await eventsListRef.set(eventsList);
                
            } catch (error) {
                console.error(`Error syncing events list to Realtime Database:`, error);
                // Don't throw - this is a non-critical sync operation
            }
        }, 'syncEventsListToRealtime')
    );
