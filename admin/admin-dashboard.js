// Firebase Configuration and Initialization
const firebaseConfig = {
    apiKey: "AIzaSyAnwGIka86C74YsqCNwCwqTebYcynjaK2k",
    authDomain: "rsacertify.firebaseapp.com",
    projectId: "rsacertify",
    storageBucket: "rsacertify.firebasestorage.app",
    messagingSenderId: "623867096357",
    appId: "1:623867096357:web:8af2600adc0145b14dfecc",
    measurementId: "G-RTT3BLGHYN",
    databaseURL: "https://rsacertify-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
let auth, db, realtimeDb;
try {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
    
    auth = firebase.auth();
    db = firebase.firestore();
    realtimeDb = firebase.database();
    
    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
} catch (error) {
    throw error;
}

// Global variables
let currentUser = null;
let selectedEvent = null;
let participantsManager = null;
let participantsCache = [];
let participantsSortKey = 'name';
let participantsSortDir = 'asc';
let eventsCache = [];
let adminsCache = [];
let invitesCache = [];
let bulkRows = [];
let existingByEmail = {};
let adminsLoaded = false;
let realtimeCounterListeners = {};

// Utility functions
function el(id) { return document.getElementById(id); }

        function showApp() {
    document.getElementById('gateScreen').style.display = 'none'; 
    document.getElementById('appContainer').style.display = 'block'; 
        }

function showGate(message) {
    document.getElementById('appContainer').style.display = 'none'; 
    const g = document.getElementById('gateScreen'); 
    g.style.display = 'block'; 
    if (message) {
        const m = document.getElementById('gateMessage'); 
        if (m) m.textContent = message; 
    } 
}

// Enhanced alert system
function showAlert(message, type = 'info', duration = 5000) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = `
        top: 20px; 
        right: 20px; 
        z-index: 9999; 
        min-width: 300px; 
        max-width: 500px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    `;
    
    const iconMap = {
        success: 'check-circle',
        danger: 'exclamation-triangle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    alertDiv.innerHTML = `
        <div class="d-flex align-items-start">
            <i class="fa-solid fa-${iconMap[type] || 'info-circle'} me-2 mt-1"></i>
            <div class="flex-grow-1">
                <div class="fw-semibold">${message}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, duration);
}

// Authentication functions
        async function signIn() {
            try {
        if (!auth) {
            showAlert('Firebase authentication not available. Please refresh the page.', 'danger');
            return;
        }
        
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
                
        try {
            showAlert('Opening Google sign-in popup...', 'info', 2000);
            await auth.signInWithPopup(provider);
        } catch (popupError) {
            if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/popup-closed-by-user') {
                showAlert('Popup blocked. Redirecting to Google sign-in...', 'warning', 3000);
            } else {
                showAlert('Popup failed. Redirecting to Google sign-in...', 'info', 3000);
            }
            await auth.signInWithRedirect(provider);
        }
            } catch (error) {
                showAlert('Authentication failed: ' + error.message, 'danger');
    }
}

// Expose signIn immediately for inline onclick handlers
window.signIn = signIn;

function signOut() { 
    if (auth) {
        auth.signOut(); 
    }
}

// Expose signOut immediately for inline onclick handlers
window.signOut = signOut;

// Setup authentication
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (!user) { 
            showGate('Sign in to continue.'); 
            return;
        }
        
        try {
            el('signinBtn').classList.add('d-none');
            el('signoutBtn').classList.remove('d-none');
            
            const userEmail = (user.email || '').toLowerCase();
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            
            if (!adminDoc.exists) {
                const inviteDoc = await db.collection('invites').doc(userEmail).get();
                if (inviteDoc.exists) {
                    await db.collection('admins').doc(user.uid).set({ 
                        email: userEmail, 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
                    }, { merge: true });
                    await db.collection('invites').doc(userEmail).delete().catch(() => {});
                    
                    adminsCache.push({ id: user.uid, email: userEmail, createdAt: new Date() });
                    invitesCache = invitesCache.filter(invite => invite.email !== userEmail);
                } else {
                    showGate('Access denied. Ask an existing admin to invite you.'); 
                    await auth.signOut().catch(() => {}); 
                    return; 
                }
            }
            
            showApp();
            loadEvents();
            
        } catch (error) {
            showGate('Error verifying admin access: ' + error.message);
            await auth.signOut().catch(() => {});
        }
    });
} else {
    showGate('Firebase authentication not available. Please refresh the page.');
}

// Tab switching functionality
function switchTab(name) {
    el('eventsSection').classList.toggle('d-none', name !== 'events');
    el('participantsSection').classList.toggle('d-none', name !== 'participants');
    el('adminsSection').classList.toggle('d-none', name !== 'admins');
    el('tab-events').classList.toggle('active', name === 'events');
    el('tab-participants').classList.toggle('active', name === 'participants');
    el('tab-admins').classList.toggle('active', name === 'admins');
    
    // Load data only when tab is accessed (lazy loading)
    if (name === 'admins' && !adminsLoaded) {
        loadAdmins();
        loadInvites();
        adminsLoaded = true;
    }
}

// Events Management
async function refreshCertificateCount(eventId) {
    try {
        const refreshBtn = document.querySelector(`button[onclick="refreshCertificateCount('${eventId}')"]`);
        if (!refreshBtn) {
            showAlert('Refresh button not found', 'danger', 3000);
            return;
        }
        
        const targetRow = refreshBtn.closest('tr');
        if (!targetRow) {
            showAlert('Target row not found', 'danger', 3000);
            return;
        }
        
        const badges = targetRow.querySelectorAll('.badge');
        const targetBadge = badges[1];
        
        if (!targetBadge) {
            showAlert('Certificate count badge not found', 'danger', 3000);
            return;
        }
        
        const originalText = targetBadge.textContent;
        targetBadge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const eventDoc = await db.collection('events').doc(eventId).get();
        const certificatesCount = eventDoc.data()?.certificatesCount || 0;
        
        targetBadge.textContent = certificatesCount;
        
        showAlert(`Certificate count refreshed: ${certificatesCount} issued`, 'success', 2000);
        
    } catch (error) {
        showAlert('Failed to refresh certificate count: ' + error.message, 'danger', 3000);
        
        // Restore original text on error
        const refreshBtn = document.querySelector(`button[onclick="refreshCertificateCount('${eventId}')"]`);
        if (refreshBtn) {
            const targetRow = refreshBtn.closest('tr');
            const badges = targetRow?.querySelectorAll('.badge');
            const targetBadge = badges?.[1];
            if (targetBadge) {
                targetBadge.textContent = originalText;
            }
        }
    }
}

async function loadEvents() {
    const tbody = document.querySelector('#eventsTable tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading events...</div></td></tr>';
    
    try {
        let eventsData = [];
        
        // Try to load from Realtime DB events/list first (1 free read)
        if (realtimeDb) {
            try {
                const eventsListRef = realtimeDb.ref('events/list');
                const snapshot = await eventsListRef.once('value');
                const eventsList = snapshot.val();
                
                if (eventsList && Array.isArray(eventsList) && eventsList.length > 0) {
                    // Convert to expected format
                    eventsData = eventsList.map(event => ({
                        id: event.id,
                        title: event.title || '',
                        date: event.date || '',
                        participantsCount: event.participantsCount || 0,
                        certificatesCount: event.certificatesCount || 0,
                        updatedAt: event.updatedAt ? { seconds: Math.floor(event.updatedAt / 1000) } : null,
                        createdAt: event.createdAt ? { seconds: Math.floor(event.createdAt / 1000) } : null
                    }));
                    
                    // Cache events data
                    eventsCache = eventsData;
                    
                    // Render events
                    renderEventsFromCache();
                    
                    // Update stats
                    if (el('totalEvents')) { el('totalEvents').innerText = eventsData.length; }
                    
                    return; // Success - no Firestore reads needed
                }
            } catch (rtdbError) {
            }
        }
        
        // Fallback to Firestore (existing code)
        const snap = await db.collection('events').get();
        eventsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort by updatedAt/createdAt
        eventsData.sort((a, b) => {
            const ta = (a.updatedAt?.seconds || a.createdAt?.seconds || 0);
            const tb = (b.updatedAt?.seconds || b.createdAt?.seconds || 0);
            return tb - ta;
        });
        
        // Cache events data
        eventsCache = eventsData;
        
        const rows = [];
        
        // Process each event using cached participant count and real-time certificate count
        for (const e of eventsData) {
            // Use cached counts from event document (cost efficient - maintained by Cloud Functions)
            const participantsCount = e.participantsCount || 0;
            const certificatesCount = e.certificatesCount || 0;
            
            rows.push(`<tr>
                <td>
                    <div class="fw-semibold fs-6">${e.title || '(untitled)'}</div>
                    <div class="text-muted small">
                        <i class="fa-solid fa-calendar me-1"></i>${e.date || 'No date set'}
                    </div>
                    <div class="text-muted small">
                        <i class="fa-solid fa-hashtag me-1"></i>${e.id}
                    </div>
                </td>
                        <td>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary fs-6" id="participantsCountBadge-${e.id}">${participantsCount}</span>
                                <span class="text-muted small">participants</span>
                            </div>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-success fs-6" id="certificatesCountBadge-${e.id}">${certificatesCount}</span>
                        <span class="text-muted small">issued</span>
                    </div>
                </td>
                <td>
                    <div class="text-muted small">
                        ${e.updatedAt ? new Date(e.updatedAt.seconds * 1000).toLocaleDateString() : '-'}
                    </div>
                    <div class="text-muted small">
                        ${e.updatedAt ? new Date(e.updatedAt.seconds * 1000).toLocaleTimeString() : ''}
                    </div>
                </td>
                <td class="text-end">
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary" onclick="openEventModal('${e.id}')" title="Edit Event">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="manageParticipants('${e.id}')" title="Manage Participants">
                            <i class="fa-solid fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteEvent('${e.id}','${(e.title || '').replace(/\"/g,'\\\"')}')" title="Delete Event">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>`);
        }
        
        if (rows.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="5" class="empty-state">
                    <i class="fa-solid fa-calendar-xmark"></i>
                    <h6 class="mt-2">No events yet</h6>
                    <p class="mb-0">Create your first event to get started</p>
                </td></tr>`;
        } else {
            tbody.innerHTML = rows.join('');
        }
        
        // Update stats
        if (el('totalEvents')) { el('totalEvents').innerText = eventsData.length; }
        
        // Setup real-time counter listeners for all events
        setupRealtimeCountersForAllEvents(eventsData);
        
    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="5" class="empty-state">
                <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                <h6 class="mt-2">Error loading events</h6>
                <p class="mb-0 text-danger">${error.message}</p>
            </td></tr>`;
    }
}

/**
 * Setup Realtime Database listeners for event counters
 */
function setupRealtimeCountersForAllEvents(events) {
    if (!realtimeDb) {
        return;
    }
    
    Object.values(realtimeCounterListeners).forEach(off => off());
    realtimeCounterListeners = {};
    
    events.forEach(event => {
        const eventId = event.id || event.doc?.id;
        if (!eventId) return;
        
        const countersRef = realtimeDb.ref(`events/${eventId}/counters`);
        
        const listener = countersRef.on('value', (snapshot) => {
            const counters = snapshot.val();
            if (counters) {
                updateEventCountersInUI(eventId, counters);
            }
        });
        
        realtimeCounterListeners[eventId] = () => countersRef.off('value', listener);
    });
}

/**
 * Update event counters in the UI when Realtime Database updates
 */
function updateEventCountersInUI(eventId, counters) {
    const tbody = document.querySelector('#eventsTable tbody');
    if (!tbody) return;
    
    let row = tbody.querySelector(`tr[data-event-id="${eventId}"]`);
    if (!row) {
        // Try to find by button onclick attribute
        const buttons = tbody.querySelectorAll(`button[onclick*="'${eventId}'"]`);
        if (buttons.length > 0) {
            row = buttons[0].closest('tr');
        }
    }
    
    if (row) {
        // Update participants count badge
        const participantsBadge = row.querySelector('.badge.bg-primary');
        if (participantsBadge && counters.participants !== undefined) {
            participantsBadge.textContent = counters.participants;
        }
        
        // Update certificates count badge
        const certificatesBadge = row.querySelector('.badge.bg-success');
        if (certificatesBadge && counters.certificates !== undefined) {
            certificatesBadge.textContent = counters.certificates;
        }
        
        // Update cache
        const eventIndex = eventsCache.findIndex(e => e.id === eventId);
        if (eventIndex !== -1) {
            eventsCache[eventIndex].participantsCount = counters.participants || 0;
            eventsCache[eventIndex].certificatesCount = counters.certificates || 0;
        }
    }
}

function renderEventsFromCache() {
    const tbody = document.querySelector('#eventsTable tbody');
    if (!tbody || !eventsCache) return;
    
    const rows = eventsCache.map(e => {
        const participantsCount = e.participantsCount || 0;
        const certificatesCount = e.certificatesCount || 0;
        
        return `<tr>
            <td>
                <div class="fw-semibold fs-6">${e.title || '(untitled)'}</div>
                <div class="text-muted small">
                    <i class="fa-solid fa-calendar me-1"></i>${e.date || 'No date set'}
                </div>
                <div class="text-muted small">
                    <i class="fa-solid fa-hashtag me-1"></i>${e.id}
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-primary fs-6" id="participantsCountBadge-${e.id}">${participantsCount}</span>
                    <span class="text-muted small">participants</span>
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-success fs-6" id="certificatesCountBadge-${e.id}">${certificatesCount}</span>
                    <span class="text-muted small">issued</span>
                </div>
            </td>
            <td>
                <div class="text-muted small">
                    ${e.updatedAt ? new Date(e.updatedAt.seconds * 1000).toLocaleDateString() : '-'}
                </div>
                <div class="text-muted small">
                    ${e.createdAt ? new Date(e.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                </div>
            </td>
            <td class="text-end">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary" onclick="openEventModal('${e.id}')" title="Edit Event">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="manageParticipants('${e.id}')" title="Manage Participants">
                        <i class="fa-solid fa-users"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteEvent('${e.id}','${(e.title || '').replace(/\"/g,'\\\"')}')" title="Delete Event">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    tbody.innerHTML = rows;
    
    // Setup Realtime DB listeners for counters after rendering
    setupRealtimeCountersForAllEvents(eventsCache);
}

const eventModal = new bootstrap.Modal(document.getElementById('eventModal'));
function openEventModal(id) {
    el('eventForm').reset();
    el('eventId').value = id || '';
    el('eventModalTitle').innerText = id ? 'Edit Event' : 'Create Event';
    // default empty fields area
    renderEventFields([]);
    if (id) {
        db.collection('events').doc(id).get().then(d => {
            const e = d.data();
            el('eventTitle').value = e.title || '';
            el('eventDate').value = e.date || '';
            renderEventFields(e.participantFields || []);
            eventModal.show();
        });
    } else {
        eventModal.show(); 
    }
}

async function saveEvent() {
    const id = el('eventId').value || undefined;
    const payload = {
        title: el('eventTitle').value.trim(),
        date: el('eventDate').value,
        participantFields: getEventFieldsFromUI(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    };
    if (!payload.title || !payload.date) return showAlert('Title and date are required', 'warning');
    if (!id) { payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(); }
    try {
        if (id) {
            await db.collection('events').doc(id).set(payload, { merge: true }); 
        } else {
            const ref = await db.collection('events').add(payload); 
            await db.collection('events').doc(ref.id).set({ participantsCount: 0, certificatesCount: 0 }, { merge: true }); 
        }
        eventModal.hide(); 
        showAlert('Event saved successfully!', 'success');
        
        await loadEvents();
    } catch (e) {
        showAlert('Failed: ' + e.message, 'danger');
    }
}

function confirmDeleteEvent(id, title) {
    showConfirm(`Delete event "${title}" and all its participants?`, async () => {
        try {
            await deleteEventCascade(id);
            
            // Reload events to ensure consistency (Cloud Functions will clean up Realtime DB)
            await loadEvents();
            
            showAlert('Event deleted successfully!', 'success');
            
            } catch (error) {
                showAlert('Failed to delete event: ' + error.message, 'danger');
            }
    });
}

async function deleteEventCascade(eventId) {
    const parts = await db.collection('events').doc(eventId).collection('participants').get(); 
    const batch = db.batch(); 
    parts.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('events').doc(eventId)); 
    await batch.commit();
}

        async function manageParticipants(eventId) {
    try {
        const doc = await db.collection('events').doc(eventId).get();
                selectedEvent = { id: doc.id, data: doc.data() };
        el('participantsEventName').innerText = selectedEvent.data.title || selectedEvent.data.slug || selectedEvent.id; 
        
        // Initialize optimized participants manager if available
        if (typeof ParticipantsManager !== 'undefined') {
            participantsManager = new ParticipantsManager();
            await participantsManager.initialize(eventId);
        } else {
            participantsManager = null;
        }
        
                renderParticipantsTableHead();
                switchTab('participants');
        await loadParticipants();
    } catch (error) {
        console.error('Error in manageParticipants:', error);
        showAlert('Error loading event: ' + error.message, 'danger');
    }
}

// Event Fields Management
function renderEventFields(fields) {
    const container = document.getElementById('eventFieldsContainer');
    if (!container) return;
    
    if (!fields || fields.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-3">
                <i class="fa-solid fa-plus-circle fa-2x mb-2"></i>
                <p class="mb-0">No custom fields defined yet</p>
            </div>`;
                return;
            }
            
    container.innerHTML = '';
    fields.forEach((f, idx) => {
        const row = document.createElement('div');
        row.className = 'row g-3 align-items-center mb-3 p-3 border rounded bg-light';
        row.innerHTML = `
            <div class="col-md-5">
                <label class="form-label small fw-semibold">Field Label</label>
                <input class="form-control" placeholder="e.g., Role, Organization" value="${f.label || ''}" data-field="label" data-index="${idx}">
            </div>
            <div class="col-md-5">
                <label class="form-label small fw-semibold">Field Key</label>
                <input class="form-control" placeholder="e.g., role, organization" value="${f.key || ''}" data-field="key" data-index="${idx}">
            </div>
            <div class="col-md-2 text-end">
                <button class="btn btn-sm btn-outline-danger" onclick="removeEventField(${idx})" title="Remove Field">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

function getEventFieldsFromUI() {
    const container = document.getElementById('eventFieldsContainer');
    if (!container) return [];
    const inputs = container.querySelectorAll('input[data-field]');
    const rows = [];
    inputs.forEach((input) => {
        const idx = Number(input.getAttribute('data-index'));
        const field = input.getAttribute('data-field');
        rows[idx] = rows[idx] || { label: '', key: '' };
        rows[idx][field] = input.value.trim();
    });
    return (rows || []).filter(r => r && r.label && r.key);
}

function addEventFieldRow() {
    const current = getEventFieldsFromUI();
    current.push({ label: '', key: '' });
    renderEventFields(current);
}

function removeEventField(index) {
    const current = getEventFieldsFromUI();
    current.splice(index, 1);
    renderEventFields(current);
}

function normalizeEventFields() {
    const current = getEventFieldsFromUI().map(f => ({ 
        label: f.label, 
        key: (f.key || f.label || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') 
    }));
    renderEventFields(current);
}

// Confirm Modal
function showConfirm(message, onConfirm) { 
    el('confirmDeleteMessage').innerText = message; 
    const m = new bootstrap.Modal(el('confirmDeleteModal')); 
    el('confirmDeleteBtn').onclick = async () => { 
        m.hide(); 
        await onConfirm(); 
    }; 
    m.show(); 
}

// Make functions globally available
window.signIn = signIn; 
window.signOut = signOut;
window.switchTab = switchTab;
window.loadEvents = loadEvents;
window.renderEventsFromCache = renderEventsFromCache;
window.openEventModal = openEventModal;
window.saveEvent = saveEvent;
window.confirmDeleteEvent = confirmDeleteEvent;
window.manageParticipants = manageParticipants;
window.addEventFieldRow = addEventFieldRow;
window.removeEventField = removeEventField;
window.normalizeEventFields = normalizeEventFields;

// Load ALL participants for the selected event into local cache, then render
async function loadParticipants(forceRefresh = false) { 
    if (!selectedEvent) return; 
    
    const tbody = document.querySelector('#participantsTable tbody'); 
            const extraFields = (selectedEvent?.data?.participantFields || []);
    const totalColumns = 4 + extraFields.length;
    
    // Show loading state
            tbody.innerHTML = `<tr><td colspan="${totalColumns}" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading participants...</div></td></tr>`;
            
            try {
        let finalParticipants = [];
        let dataSource = 'unknown';
        
        // If force refresh, skip IndexedDB and Realtime DB, go straight to Firestore
        if (!forceRefresh) {
            // 1) Try hydrate from IndexedDB (fast path, most complete data)
            try {
                const cached = await idbLoadParticipants(selectedEvent.id);
                if (cached?.rows?.length > 0) {
                    finalParticipants = cached.rows.slice();
                    dataSource = 'indexeddb';
                }
            } catch (idbError) {
                // IndexedDB unavailable, continue to next source
            }
            
            // 2) Try to load from Realtime DB index (free reads, lightweight)
            // Only use if IndexedDB didn't have data
            if (finalParticipants.length === 0 && realtimeDb) {
                try {
                    const indexRef = realtimeDb.ref(`events/${selectedEvent.id}/participants/index`);
                    const indexSnapshot = await indexRef.once('value');
                    const indexData = indexSnapshot.val();
                    
                    if (indexData && Object.keys(indexData).length > 0) {
                        // Convert index to participant-like objects for display
                        // Now includes additionalFields from Realtime DB index
                        finalParticipants = Object.keys(indexData).map(participantId => {
                            const indexEntry = indexData[participantId];
                            const participant = {
                                id: participantId,
                                name: indexEntry.name || '',
                                email: indexEntry.email || '',
                                certificateStatus: indexEntry.certificateStatus || 'pending',
                                updatedAt: indexEntry.updatedAt ? { seconds: Math.floor(indexEntry.updatedAt / 1000) } : null
                            };
                            // Include additionalFields if present in index
                            if (indexEntry.additionalFields) {
                                participant.additionalFields = indexEntry.additionalFields;
                            }
                            return participant;
                        });
                        dataSource = 'realtime-index';
                        
                        // If custom fields exist but additionalFields are missing, fetch from Firestore
                        const hasCustomFields = selectedEvent?.data?.participantFields?.length > 0;
                        const missingAdditionalFields = finalParticipants.filter(p => !p.additionalFields && hasCustomFields);
                        
                        
                        if (missingAdditionalFields.length > 0) {
                            // Fetch additionalFields for participants missing them
                            try {
                                const fetchPromises = missingAdditionalFields.map(async (p) => {
                                    try {
                                        const doc = await db.collection('events').doc(selectedEvent.id)
                                            .collection('participants').doc(p.id).get();
                                        if (doc.exists) {
                                            const fullData = doc.data();
                                            if (fullData.additionalFields) {
                                                p.additionalFields = fullData.additionalFields;
                                            }
                                        }
                                    } catch (err) {
                                        // Failed to fetch additionalFields for this participant
                                    }
                                });
                                await Promise.all(fetchPromises);
                            } catch (error) {
                                // Failed to fetch missing additionalFields
                            }
                        }
                    }
                } catch (rtdbError) {
                    // Failed to load from Realtime DB index, continue to fallback
                }
            }
        }
        
        // 3) Fallback to Firestore if no cached data or force refresh
        if (finalParticipants.length === 0 || forceRefresh) {
            const all = await fetchAllParticipantsLocal();
            finalParticipants = all;
            dataSource = 'firestore';
        }
        
        // additionalFields are now included in Realtime DB index, no need to fetch from Firestore
        
        // Update all caches consistently
        participantsCache = finalParticipants.slice();
        if (participantsManager) {
            participantsManager.participantsCache = new Map();
            finalParticipants.forEach(p => participantsManager.participantsCache.set(p.id, p));
            participantsManager.hasMore = false;
        }
        
        // Build search index
        window.__participantsLocalIndex = finalParticipants.map(p => ({
            id: p.id,
            name: (p.name || '').toLowerCase(),
            email: (p.email || '').toLowerCase()
        }));
        
        // Single render point - always render after cache is updated
        if (finalParticipants.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="${totalColumns}" class="empty-state">
                    <i class="fa-solid fa-users-slash"></i>
                    <h6 class="mt-2">No participants found</h6>
                    <p class="mb-0">Add participants to get started</p>
                </td></tr>`;
        } else {
            renderParticipantsFromCache();
        }
        
        // Update UI consistently
        el('participantsCount').innerText = finalParticipants.length;
        updateSortIcons();
        
        // Show appropriate message
        if (forceRefresh) {
            showAlert(`Refreshed: ${finalParticipants.length} participants`, 'success', 2000);
        } else {
            const sourceMessages = {
                'indexeddb': `Loaded ${finalParticipants.length} participants (cached)`,
                'realtime-index': `Loaded ${finalParticipants.length} participants (from index)`,
                'firestore': `Loaded ${finalParticipants.length} participants`,
                'unknown': `Loaded ${finalParticipants.length} participants`
            };
            showAlert(sourceMessages[dataSource] || sourceMessages['unknown'], 'success', 2000);
        }
                
        } catch (error) {
            tbody.innerHTML = `
                <tr><td colspan="${totalColumns}" class="empty-state">
                    <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                    <h6 class="mt-2">Error loading participants</h6>
                    <p class="mb-0 text-danger">${error.message}</p>
                </td></tr>`;
            showAlert('Failed to load participants: ' + error.message, 'danger');
        }
}

// Fetch all participants for the event in chunks and populate caches
async function fetchAllParticipantsLocal() {
    const all = [];
    let lastDoc = null;
    const chunk = 500;
    while (true) {
        let query = db.collection('events').doc(selectedEvent.id)
            .collection('participants')
            .orderBy('name')
            .limit(chunk);
        if (lastDoc) query = query.startAfter(lastDoc);
        const snap = await query.get();
        if (snap.empty) break;
        snap.docs.forEach(d => all.push({ id: d.id, ...d.data() }));
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < chunk) break;
    }

    // Fill both caches
    participantsCache = all.slice();
    if (participantsManager) {
        participantsManager.participantsCache = new Map();
        all.forEach(p => participantsManager.participantsCache.set(p.id, p));
        participantsManager.hasMore = false;
    }
    // Build lightweight local search index
    try {
        window.__participantsLocalIndex = all.map(p => ({
            id: p.id,
            name: (p.name || '').toLowerCase(),
            email: (p.email || '').toLowerCase()
        }));
    } catch (_) {}

    // Persist to IndexedDB (best-effort)
    try {
        await idbSaveParticipants(selectedEvent.id, all);
            } catch (e) {
                // IndexedDB save failed, continue without caching
            }
    return all;
}

// IndexedDB helpers (tiny wrapper, no external deps)
function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('RSACertifyDB', 1);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains('participants')) {
                db.createObjectStore('participants', { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbSaveParticipants(eventId, rows) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('participants', 'readwrite');
        const store = tx.objectStore('participants');
        store.put({ key: eventId, rows, savedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

async function idbLoadParticipants(eventId) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('participants', 'readonly');
        const store = tx.objectStore('participants');
        const req = store.get(eventId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

// Fallback participants loading (original method)
async function loadParticipantsFallback() {
    if (!selectedEvent) return;
    
    const tbody = document.querySelector('#participantsTable tbody');
                const extraFields = (selectedEvent?.data?.participantFields || []);
                const totalColumns = 4 + extraFields.length;
            
            try {
        const snap = await db.collection('events').doc(selectedEvent.id).collection('participants').orderBy('name').get(); 
                participantsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderParticipantsFromCache();
                
                // Update participant count display
        el('participantsCount').innerText = snap.size;
        
        // Note: Cloud Functions will automatically update event document counts
        // No need to manually update counts here
                
            } catch (error) {
                tbody.innerHTML = `
                    <tr><td colspan="${totalColumns}" class="empty-state">
                        <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                        <h6 class="mt-2">Error loading participants</h6>
                        <p class="mb-0 text-danger">${error.message}</p>
                    </td></tr>`;
            }
        }

const participantModal = new bootstrap.Modal(document.getElementById('participantModal'));
async function openParticipantModal(id) {
    if (!selectedEvent) return showAlert('Select an event first', 'warning'); 
    
    el('participantForm').reset();
    el('participantId').value = id || '';
    el('participantEventId').value = selectedEvent.id;
    
    // Update modal title
    const title = el('participantModal').querySelector('.modal-title');
    if (title) {
        title.innerHTML = `<i class="fa-solid fa-${id ? 'user-edit' : 'user-plus'} me-2"></i>${id ? 'Edit' : 'Add'} Participant`;
    }
    
    // Handle custom fields
    const extra = (selectedEvent.data.participantFields || []);
    const customFieldsSection = el('customFieldsSection');
    const customFieldsContainer = el('customFieldsContainer');
    
    if (extra.length > 0) {
        customFieldsSection.style.display = 'block';
        customFieldsContainer.innerHTML = '';
        
        extra.forEach(f => {
            const wrapper = document.createElement('div');
            wrapper.className = 'col-md-6 mb-3';
            wrapper.innerHTML = `
                <label class="form-label fw-semibold">${f.label} *</label>
                <input class="form-control" id="pf_${f.key}" placeholder="Enter ${f.label.toLowerCase()}" required>
            `;
            customFieldsContainer.appendChild(wrapper);
        });
    } else {
        customFieldsSection.style.display = 'none';
    }
    
    // Load existing data if editing
    if (id) {
        let participant = participantsCache.find(p => p.id === id);
        
        // If participant found but missing additionalFields (loaded from Realtime DB index),
        // fetch full document from Firestore
        if (participant && (!participant.additionalFields || Object.keys(participant.additionalFields || {}).length === 0) && selectedEvent.data.participantFields?.length > 0) {
            try {
                const doc = await db.collection('events').doc(selectedEvent.id)
                    .collection('participants').doc(id).get();
                if (doc.exists) {
                    const fullData = doc.data();
                    participant = { id: doc.id, ...fullData };
                    const index = participantsCache.findIndex(p => p.id === id);
                    if (index !== -1) {
                        participantsCache[index] = participant;
                    }
                }
            } catch (error) {
                // Failed to fetch full participant data
            }
        }
        
        if (participant) {
            el('participantName').value = participant.name || '';
            el('participantEmail').value = participant.email || '';
            
            // Load custom fields
            (selectedEvent.data.participantFields || []).forEach(f => {
                const v = (participant.additionalFields || {})[f.key] || '';
                const input = document.getElementById('pf_' + f.key);
                if (input) input.value = v;
            });
        } else {
            // If still not found, try fetching directly from Firestore
            try {
                const doc = await db.collection('events').doc(selectedEvent.id)
                    .collection('participants').doc(id).get();
                if (doc.exists) {
                    const fullData = doc.data();
                    participant = { id: doc.id, ...fullData };
                    // Add to cache
                    participantsCache.push(participant);
                    
                    el('participantName').value = participant.name || '';
                    el('participantEmail').value = participant.email || '';
                    
                    // Load custom fields
                    (selectedEvent.data.participantFields || []).forEach(f => {
                        const v = (participant.additionalFields || {})[f.key] || '';
                        const input = document.getElementById('pf_' + f.key);
                        if (input) input.value = v;
                    });
                } else {
                    showAlert('Participant not found. Please refresh the participants list.', 'warning');
            return;
                }
            } catch (error) {
                showAlert('Failed to load participant data. Please refresh the participants list.', 'danger');
                return;
            }
        }
    }
    
    participantModal.show();
}

async function saveParticipant() {
    if (!selectedEvent) return showAlert('No event selected', 'warning');
    
    const id = el('participantId').value || undefined;
    const email = el('participantEmail').value.trim().toLowerCase();
    
    const payload = {
        name: el('participantName').value.trim(),
        email: email,
        certificateStatus: 'pending'
    };
    
    // Only include id if it exists (for updates)
    if (id) {
        payload.id = id;
    }
    
    if (!payload.name || !payload.email) return showAlert('Name and email are required', 'warning'); 
    
    // Check for duplicate email
    if (!id) {
        const existing = participantsManager ? 
            participantsManager.getCachedParticipants().find(p => p.email.toLowerCase() === email) :
            (participantsCache || []).find(p => p.email.toLowerCase() === email);
        if (existing) {
            showAlert('A participant with this email already exists in this event.', 'warning');
            return;
        }
    }
    
    // Collect custom fields
    const additionalFields = {};
    const missingFields = [];
    (selectedEvent.data.participantFields || []).forEach(f => {
        const input = document.getElementById('pf_' + f.key);
        if (input) {
            const value = input.value.trim();
            if (!value) missingFields.push(f.label);
            additionalFields[f.key] = value;
        }
    });
    
    if (missingFields.length > 0) return showAlert(`Please fill in all required fields: ${missingFields.join(', ')}`, 'warning'); 
    payload.additionalFields = additionalFields;
    
    try {
        if (participantsManager) {
            // Use optimized manager to save participant
            const participant = await participantsManager.saveParticipant(payload, !!id);
            
            // Update global participantsCache to keep it in sync
            if (id) {
                // Update existing participant in cache
                const index = participantsCache.findIndex(p => p.id === id);
                if (index !== -1) {
                    participantsCache[index] = participant;
                } else {
                    participantsCache.push(participant);
                }
            } else {
                // Add new participant to cache
                participantsCache.push(participant);
            }
            
            participantModal.hide(); 
            
            // Update UI
            renderParticipantsFromCache();
            
            // Update participant count display
            const totalCount = participantsCache.length;
            el('participantsCount').innerText = totalCount;
            
            showAlert('Participant saved successfully!', 'success');
        } else {
            // Fallback to original method
            await saveParticipantFallback(payload, id);
        }
        
    } catch (e) {
        console.error('Error saving participant:', e);
        showAlert('Failed: ' + e.message, 'danger');
    }
}

// Fallback save participant method
async function saveParticipantFallback(payload, id) {
    const eventId = selectedEvent.id;
    
    try {
        // Remove id from payload - it's the document ID, not a field
        const { id: _, ...dataWithoutId } = payload;
        
        if (id) {
            // Update existing participant
            await db.collection('events').doc(eventId).collection('participants').doc(id).set(dataWithoutId, { merge: true }); 
            
            // Update local cache
            const index = participantsCache.findIndex(p => p.id === id);
            if (index !== -1) {
                participantsCache[index] = { id, ...dataWithoutId };
            }
        } else {
            // Add new participant
            dataWithoutId.createdAt = firebase.firestore.FieldValue.serverTimestamp(); 
            const docRef = await db.collection('events').doc(eventId).collection('participants').add(dataWithoutId); 
            
            // Add to local cache
            participantsCache.push({ id: docRef.id, ...dataWithoutId });
        }
        
        participantModal.hide(); 
        
        // Update UI without full reload
        renderParticipantsFromCache();
        
        // Update participant count display
        el('participantsCount').innerText = participantsCache.length;
        
        showAlert('Participant saved successfully!', 'success');
        
    } catch (e) {
        throw e;
    }
}

function confirmDeleteParticipant(id, name) {
    showConfirm(`Delete participant "${name}"?`, async () => {
        try {
            // Use participantsManager if available
            if (participantsManager) {
                await participantsManager.deleteParticipant(id);
            } else {
            await db.collection('events').doc(selectedEvent.id).collection('participants').doc(id).delete(); 
            }
            
            // Update local cache
            participantsCache = participantsCache.filter(p => p.id !== id);
            
            // Update UI without full reload
            renderParticipantsFromCache();
            
            // Update participant count display
            el('participantsCount').innerText = participantsCache.length;
            
            // Note: Cloud Functions will automatically update event document counts
            // No need to manually update counts here
            
            showAlert('Participant deleted successfully!', 'success');
            
            } catch (error) {
                showAlert('Failed to delete participant: ' + error.message, 'danger');
            }
    });
}

// Refresh participants list (force reload from Firestore)
async function refreshParticipants() {
    if (!selectedEvent) return;
    await loadParticipants(true); // Force refresh
}

window.loadParticipants = loadParticipants;
window.refreshParticipants = refreshParticipants;
window.openParticipantModal = openParticipantModal;
window.saveParticipant = saveParticipant;
window.confirmDeleteParticipant = confirmDeleteParticipant;

// Participants Rendering and Filtering
function renderParticipantsFromCache() {
    const tbody = document.querySelector('#participantsTable tbody');
    if (!tbody) return;
    
    const { q, status } = getParticipantsFilters();
    // Prefer manager cache when available
    const baseData = participantsManager
        ? (participantsManager.getCachedParticipants() || [])
        : (participantsCache || []);
    let data = baseData.slice();
    
    // Apply filters
    if (q) {
        data = data.filter(p => 
            (p.name || '').toLowerCase().includes(q) || 
            (p.email || '').toLowerCase().includes(q)
        );
    }
    if (status) {
        data = data.filter(p => (p.certificateStatus || '') === status);
    }
    
    // Apply sorting (supports custom fields under additionalFields)
    const resolveSortValue = (row, key) => {
        if (row == null) return '';
        const direct = row[key];
        if (direct !== undefined && direct !== null) return direct;
        const nested = (row.additionalFields || {})[key];
        return nested !== undefined && nested !== null ? nested : '';
    };

    data.sort((a, b) => {
        const avRaw = resolveSortValue(a, participantsSortKey);
        const bvRaw = resolveSortValue(b, participantsSortKey);

        // Try numeric compare when both are numbers
        const aNum = typeof avRaw === 'number' ? avRaw : Number.NaN;
        const bNum = typeof bvRaw === 'number' ? bvRaw : Number.NaN;
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            return participantsSortDir === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Handle Firestore Timestamps/dates
        const toMillis = (v) => {
            if (!v) return null;
            if (typeof v?.toDate === 'function') return v.toDate().getTime();
            if (v instanceof Date) return v.getTime();
            return null;
        };
        const aMs = toMillis(avRaw);
        const bMs = toMillis(bvRaw);
        if (aMs !== null && bMs !== null) {
            return participantsSortDir === 'asc' ? aMs - bMs : bMs - aMs;
        }

        // Default string compare (case-insensitive)
        const av = (avRaw ?? '').toString().toLowerCase();
        const bv = (bvRaw ?? '').toString().toLowerCase();
        if (av === bv) return 0;
        return participantsSortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
    
    const extraFields = (selectedEvent?.data?.participantFields || []);
    const totalColumns = 4 + extraFields.length;
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="${totalColumns}" class="empty-state">
                <i class="fa-solid fa-users-slash"></i>
                <h6 class="mt-2">No participants found</h6>
                <p class="mb-0">Try adjusting your search or filters</p>
            </td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(p => {
        const customFieldsHtml = extraFields.map(f => {
            const value = (p.additionalFields || {})[f.key] || '';
            return `<td>${value || '—'}</td>`;
        }).join('');
        
        const statusBadge = p.certificateStatus === 'downloaded' 
            ? `<span class="status-badge success" data-participant-id="${p.id}"><i class="fa-solid fa-check me-1"></i>Downloaded</span>`
            : `<span class="status-badge pending" data-participant-id="${p.id}"><i class="fa-solid fa-clock me-1"></i>Pending</span>`;
        
        return `<tr>
            <td><div class="fw-semibold">${p.name || '—'}</div></td>
            <td><div class="text-muted">${p.email || '—'}</div></td>
            ${customFieldsHtml}
            <td>
                <div class="d-flex align-items-center gap-2">
                    ${statusBadge}
                    <button class="btn btn-sm btn-outline-secondary p-1" onclick="refreshParticipantStatus('${p.id}')" title="Refresh status">
                        <i class="fas fa-sync-alt" style="font-size: 0.75rem;"></i>
                    </button>
                </div>
            </td>
            <td class="text-end">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary" onclick="openParticipantModal('${p.id}')" title="Edit">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteParticipant('${p.id}','${(p.name || '').replace(/\"/g,'\\\"')}')" title="Delete">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function getParticipantsFilters() {
    return {
        q: (el('participantsSearch')?.value || '').toLowerCase(),
        status: el('participantsStatusFilter')?.value || ''
    };
}

function setParticipantsSort(key) {
    if (participantsSortKey === key) {
        participantsSortDir = participantsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        participantsSortKey = key;
        participantsSortDir = 'asc';
    }
    updateSortIcons();
    renderParticipantsFromCache();
}

function updateSortIcons() {
    document.querySelectorAll('[id^="sort-"]').forEach(icon => {
        icon.className = 'fa-solid fa-sort ms-1';
    });
    const activeIcon = el('sort-' + participantsSortKey);
    if (activeIcon) {
        activeIcon.className = `fa-solid fa-sort-${participantsSortDir === 'asc' ? 'up' : 'down'} ms-1`;
    }
}

// Event listeners for filtering
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = el('participantsSearch');
    const statusFilter = el('participantsStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', renderParticipantsFromCache);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', renderParticipantsFromCache);
    }
});

// Refresh a single participant's certificate status (read-only)
async function refreshParticipantStatus(participantId) {
    if (!selectedEvent || !participantId) return;
    try {
        // Locate the badge for this participant
        const rowButton = document.querySelector(`button[onclick="refreshParticipantStatus('${participantId}')"]`);
        const row = rowButton?.closest('tr');
        const badge = row?.querySelector(`[data-participant-id="${participantId}"]`);
        
        // Show spinner while fetching
        const originalHtml = badge?.innerHTML;
        if (badge) {
            badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        // Read latest participant doc
        const doc = await db.collection('events').doc(selectedEvent.id)
            .collection('participants').doc(participantId).get();
        const data = doc.data() || {};
        const status = data.certificateStatus || 'pending';
        
        // Update local cache
        const idx = participantsCache.findIndex(p => p.id === participantId);
        if (idx !== -1) {
            participantsCache[idx] = { ...participantsCache[idx], certificateStatus: status };
        }
        
        // Update badge UI
        if (badge) {
            if (status === 'downloaded') {
                badge.className = 'status-badge success';
                badge.innerHTML = '<i class="fa-solid fa-check me-1"></i>Downloaded';
            } else {
                badge.className = 'status-badge pending';
                badge.innerHTML = '<i class="fa-solid fa-clock me-1"></i>Pending';
            }
        }
        
        showAlert('Participant status refreshed', 'success', 1500);
        } catch (error) {
            showAlert('Failed to refresh status', 'danger', 2000);
        }
}

// Participants Table Head Rendering
function renderParticipantsTableHead() {
    const thead = document.querySelector('#participantsTable thead');
    if (!thead) return;
    
    const extraFields = (selectedEvent?.data?.participantFields || []);
    const customFieldsHtml = extraFields.map(f => 
        `<th role="button" onclick="setParticipantsSort('${f.key}')" class="sortable-header">
            ${f.label} <i class="fa-solid fa-sort ms-1" id="sort-${f.key}"></i>
        </th>`
    ).join('');
    
    thead.innerHTML = `
        <tr>
            <th role="button" onclick="setParticipantsSort('name')" class="sortable-header">
                Name <i class="fa-solid fa-sort ms-1" id="sort-name"></i>
            </th>
            <th role="button" onclick="setParticipantsSort('email')" class="sortable-header">
                Email <i class="fa-solid fa-sort ms-1" id="sort-email"></i>
            </th>
            ${customFieldsHtml}
            <th role="button" onclick="setParticipantsSort('certificateStatus')" class="sortable-header">
                Certificate Status <i class="fa-solid fa-sort ms-1" id="sort-certificateStatus"></i>
            </th>
            <th class="text-end">Actions</th>
        </tr>
    `;
}

window.renderParticipantsFromCache = renderParticipantsFromCache;
window.setParticipantsSort = setParticipantsSort;
window.renderParticipantsTableHead = renderParticipantsTableHead;
window.refreshParticipantStatus = refreshParticipantStatus;
window.updateSortIcons = updateSortIcons;
window.getParticipantsFilters = getParticipantsFilters;
window.exportParticipantsCsvLocal = exportParticipantsCsvLocal;
window.toggleLiveUpdates = toggleLiveUpdates;
window.applyQuickStatus = applyQuickStatus;

// Bulk Upload Functionality
const bulkUploadModal = new bootstrap.Modal(document.getElementById('bulkUploadModal'));
function openBulkUploadModal() {
    if (!selectedEvent) return showAlert('Select an event first', 'warning');
    
    el('bulkCsvInput').value = '';
    el('bulkPreview').classList.add('d-none');
    el('bulkImportBtn').disabled = true;
    bulkUploadModal.show();
}

// CSV Parsing
function parseCsv(text) {
    function parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((header, i) => {
            row[header] = values[i] || '';
        });
        return row;
    });
    
    return { headers, rows };
}

// File upload handler
document.addEventListener('DOMContentLoaded', function() {
    const csvInput = el('bulkCsvInput');
    if (csvInput) {
        csvInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
    if (!file) return;
    
            try {
                const text = await file.text();
                const { headers, rows } = parseCsv(text);
                
                if (headers.length === 0 || rows.length === 0) {
                    showAlert('Invalid CSV file format', 'warning');
            return;
        }
        
                // Check for required headers
                if (!headers.includes('email') || !headers.includes('name')) {
                    showAlert('CSV must contain "email" and "name" columns', 'warning');
                    return;
                }
                
                // Use local cache for duplicate detection (no database query needed)
                existingByEmail = {};
                participantsCache.forEach(p => {
                    if (p.email) {
                        existingByEmail[p.email.toLowerCase()] = p.id;
                    }
                });
                
                // Process rows
        const csvCounts = {};
        rows.forEach(r => {
            const em = (r.email || '').toLowerCase();
            if (!em) return;
            csvCounts[em] = (csvCounts[em] || 0) + 1;
        });
        
        bulkRows = rows.map(r => ({
            name: r.name || '',
            email: (r.email || '').toLowerCase(),
            _dupCSV: csvCounts[(r.email || '').toLowerCase()] > 1,
            _exists: !!existingByEmail[(r.email || '').toLowerCase()],
            ...Object.fromEntries(
                Object.entries(r).filter(([key]) => !['name', 'email'].includes(key))
            )
                }));
                
                renderBulkPreview(headers, bulkRows);
        el('bulkPreview').classList.remove('d-none');
                el('bulkImportBtn').disabled = false;
                
            } catch (error) {
                showAlert('Error reading CSV file: ' + error.message, 'danger');
            }
        });
    }
});

function renderBulkPreview(headers, rows) {
    const thead = el('bulkHead');
    const tbody = el('bulkBody');
    
    // Headers
    thead.innerHTML = `
        <tr>
            <th>Status</th>
            ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
    `;
    
    // Rows
    tbody.innerHTML = rows.map(row => {
        let statusClass = 'table-success';
        let statusText = 'New';
        
        if (row._dupCSV) {
            statusClass = 'table-danger';
            statusText = 'Duplicate in CSV';
        } else if (row._exists) {
            statusClass = 'table-warning';
            statusText = 'Will update existing';
        }
        
        return `
            <tr class="${statusClass}">
                <td><span class="badge bg-${statusClass.includes('success') ? 'success' : statusClass.includes('warning') ? 'warning' : 'danger'}">${statusText}</span></td>
                ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
            </tr>
        `;
    }).join('');
}

async function uploadBulkParticipants() {
    if (!bulkRows.length) return;
    
    const CHUNK = 400; // Firestore batch limit 500; keep headroom
    let imported = 0;
    
    try {
        el('bulkImportBtn').disabled = true;
        el('bulkImportBtn').innerHTML = '<span class="loading-spinner me-2"></span>Importing...';
    
    for (let i = 0; i < bulkRows.length; i += CHUNK) {
            const batch = db.batch();
        bulkRows.slice(i, i + CHUNK).forEach(row => {
                const col = db.collection('events').doc(selectedEvent.id).collection('participants');
            const existingId = existingByEmail[row.email];
            
            const base = {
                name: row.name,
                email: row.email,
                certificateStatus: 'pending',
                    additionalFields: Object.fromEntries(
                        Object.entries(row).filter(([key]) => !['name', 'email', '_dupCSV', '_exists'].includes(key))
                    ),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (existingId) {
                    const ref = col.doc(existingId);
                batch.set(ref, base, { merge: true });
            } else {
                    const ref = col.doc();
                    batch.set(ref, { ...base, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
        });
        
        await batch.commit();
        imported += Math.min(CHUNK, bulkRows.length - i);
    }
    
        // Update local cache with new/updated participants
        bulkRows.forEach(row => {
            const existingId = existingByEmail[row.email];
            const participantData = {
                name: row.name,
                email: row.email,
                certificateStatus: 'pending',
                additionalFields: Object.fromEntries(
                    Object.entries(row).filter(([key]) => !['name', 'email', '_dupCSV', '_exists'].includes(key))
                ),
                updatedAt: new Date()
            };
            
            if (existingId) {
                // Update existing participant in cache
                const index = participantsCache.findIndex(p => p.id === existingId);
                if (index !== -1) {
                    participantsCache[index] = { id: existingId, ...participantData };
                }
            } else {
                // For new participants, we need to reload to get the actual IDs
                // This is a limitation of batch operations - we don't get the generated IDs back
                // So we'll do a minimal reload just for the new participants
            }
        });
        
        // For new participants, we need to reload to get their actual IDs
        // But we can optimize by only reloading if there were new participants
        const hasNewParticipants = bulkRows.some(row => !existingByEmail[row.email]);
        if (hasNewParticipants) {
            // Reload only the new participants to get their IDs
            const newEmails = bulkRows.filter(row => !existingByEmail[row.email]).map(row => row.email);
            const newParticipantsSnap = await db.collection('events').doc(selectedEvent.id)
                .collection('participants').where('email', 'in', newEmails).get();
            
            // Add new participants to cache
            newParticipantsSnap.docs.forEach(doc => {
                const data = doc.data();
                participantsCache.push({ id: doc.id, ...data });
            });
        }
        
        // Update UI without full reload
        renderParticipantsFromCache();
        
        // Update participant count display
        el('participantsCount').innerText = participantsCache.length;
        
        // Note: Cloud Functions will automatically update event document counts
        // No need to manually update counts here
        
        showAlert(`Successfully imported ${imported} participants`, 'success');
        bulkUploadModal.hide();
        
    } catch (error) {
        showAlert('Import failed: ' + error.message, 'danger');
    } finally {
        el('bulkImportBtn').disabled = false;
        el('bulkImportBtn').innerHTML = '<i class="fa-solid fa-upload me-1"></i>Import Participants';
    }
}

// CSV Export
async function exportParticipantsCsv() {
    if (!selectedEvent) return showAlert('Select an event first', 'warning');
    
    try {
        const snap = await db.collection('events').doc(selectedEvent.id).collection('participants').get();
        const fields = selectedEvent.data?.participantFields || [];
        const headers = ['name', 'email', ...fields.map(f => f.key), 'certificateStatus'];
        
        const rows = [];
        snap.forEach(doc => {
            const p = doc.data();
            const row = [
                p.name || '',
                p.email || '',
                ...fields.map(f => (p.additionalFields || {})[f.key] || ''),
                (p.certificateStatus || 'pending')
            ];
            rows.push(row);
        });
        
        const csvContent = [headers.join(','), ...rows.map(r => 
            r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
        )].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants-${selectedEvent.id}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
    } catch (error) {
        showAlert('Export failed: ' + error.message, 'danger');
    }
}

function downloadCsvTemplate() {
    const fields = selectedEvent?.data?.participantFields || [];
    const headers = ['name', 'email', ...fields.map(f => f.key)];
    const csvContent = headers.join(',') + '\n';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participants-template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

window.openBulkUploadModal = openBulkUploadModal;
window.uploadBulkParticipants = uploadBulkParticipants;
window.exportParticipantsCsv = exportParticipantsCsv;
window.downloadCsvTemplate = downloadCsvTemplate;

// New optimized functions
function setupInfiniteScroll() {
    const tbody = document.querySelector('#participantsTable tbody');
    if (!tbody || !participantsManager) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && participantsManager.hasMore) {
                loadMoreParticipants();
            }
        });
    });

    // Observe the last row
    const lastRow = tbody.lastElementChild;
    if (lastRow) {
        observer.observe(lastRow);
    }
}

async function loadMoreParticipants() {
    if (!participantsManager || !participantsManager.hasMore) return;

    try {
        const newParticipants = await participantsManager.loadParticipantsPage();
        if (newParticipants.length > 0) {
            renderParticipantsFromCache();
        }
    } catch (error) {
        console.error('Error loading more participants:', error);
    }
}

// Enhanced search with debouncing
let searchTimeout;
function setupSearchWithDebounce() {
    try {
        const searchInput = document.getElementById('participantsSearch');
        if (!searchInput) {
            return;
        }

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, 300);
        });
    } catch (error) {
        console.error('Error setting up search debounce:', error);
    }
}

async function performSearch(query) {
    try {
        const q = (query || '').toLowerCase();
        if (q.length < 2) {
            renderParticipantsFromCache();
            return;
        }

        // 1) Local index first (instant)
        const idx = window.__participantsLocalIndex || [];
        let localIds = [];
        if (idx.length > 0) {
            localIds = idx
                .filter(r => r.name.includes(q) || r.email.includes(q))
                .slice(0, 200) // cap for UI
                .map(r => r.id);
        }
        if (localIds.length > 0) {
            const base = participantsManager
                ? (participantsManager.getCachedParticipants() || [])
                : (participantsCache || []);
            const localResults = base.filter(p => localIds.includes(p.id));
            renderSearchResults(localResults);
            return;
        }

        // 2) Realtime DB search index (fast, free reads)
        if (selectedEvent && realtimeDb) {
            try {
                const searchRef = realtimeDb.ref(`events/${selectedEvent.id}/search`);
                const searchSnapshot = await searchRef.once('value');
                const searchData = searchSnapshot.val();
                
                if (searchData) {
                    // Search through searchText field
                    const matchingIds = Object.keys(searchData)
                        .filter(participantId => {
                            const searchEntry = searchData[participantId];
                            return searchEntry.searchText && searchEntry.searchText.includes(q);
                        })
                        .slice(0, 200); // cap for UI
                    
                    if (matchingIds.length > 0) {
                        // Fetch matching participants from cache or index
                        const base = participantsManager
                            ? (participantsManager.getCachedParticipants() || [])
                            : (participantsCache || []);
                        const searchResults = base.filter(p => matchingIds.includes(p.id));
                        
                        if (searchResults.length > 0) {
                            renderSearchResults(searchResults);
                            return;
                        }
                    }
                }
            } catch (rtdbError) {
            }
        }

        // 3) Cloud Function search (server-side)
        if (selectedEvent && typeof firebase !== 'undefined' && firebase.functions) {
            try {
                const searchFunction = firebase.functions().httpsCallable('searchParticipants');
                const result = await searchFunction({
                    eventId: selectedEvent.id,
                    query: q,
                    limit: 50
                });
                
                const results = result.data.results || [];
                const tbody = document.querySelector('#participantsTable tbody');
                if (!tbody) return;
                
                if (results.length === 0) {
                    const extraFields = (selectedEvent?.data?.participantFields || []);
                    const totalColumns = 4 + extraFields.length;
                    tbody.innerHTML = `
                        <tr><td colspan="${totalColumns}" class="empty-state">
                            <i class="fa-solid fa-search"></i>
                            <h6 class="mt-2">No participants found</h6>
                            <p class="mb-0">Try adjusting your search terms</p>
                        </td></tr>`;
                } else {
                    renderSearchResults(results);
                }
                return;
            } catch (error) {
                console.error('Cloud Function search failed, falling back to local:', error);
                // Fall through to local search
            }
        }
        
        // 4) Fallback to local search if Cloud Function unavailable
        if (participantsManager) {
            const results = await participantsManager.searchParticipants(q);
            const tbody = document.querySelector('#participantsTable tbody');
            if (!tbody) return;
            if (results.length === 0) {
                const extraFields = (selectedEvent?.data?.participantFields || []);
                const totalColumns = 4 + extraFields.length;
                tbody.innerHTML = `
                    <tr><td colspan="${totalColumns}" class="empty-state">
                        <i class="fa-solid fa-search"></i>
                        <h6 class="mt-2">No participants found</h6>
                        <p class="mb-0">Try adjusting your search terms</p>
                    </td></tr>`;
            } else {
                renderSearchResults(results);
            }
            return;
        }

        // Fallback simple local scan
        const filtered = (participantsCache || []).filter(p => 
            (p.name || '').toLowerCase().includes(q) || 
            (p.email || '').toLowerCase().includes(q)
        );
        renderSearchResults(filtered);
    } catch (error) {
        console.error('Search error:', error);
        renderParticipantsFromCache();
    }
}

function renderSearchResults(participants) {
    const tbody = document.querySelector('#participantsTable tbody');
    if (!tbody) return;

    const extraFields = (selectedEvent?.data?.participantFields || []);
    
    tbody.innerHTML = participants.map(participant => {
        const customFieldsHtml = extraFields.map(f => {
            const value = participant.additionalFields?.[f.key] || '';
            return `<td><span class="custom-field-badge ${!value ? 'empty' : ''}">${value || 'N/A'}</span></td>`;
        }).join('');

        return `
            <tr data-participant-id="${participant.id}">
                <td><strong>${participant.name || 'N/A'}</strong></td>
                <td>${participant.email || 'N/A'}</td>
                ${customFieldsHtml}
                <td>
                    <span class="status-badge ${participant.certificateStatus === 'downloaded' ? 'success' : 'pending'}">
                        <i class="fa-solid fa-${participant.certificateStatus === 'downloaded' ? 'check-circle' : 'clock'}"></i>
                        ${participant.certificateStatus === 'downloaded' ? 'Downloaded' : 'Pending'}
                    </span>
                </td>
                <td class="text-end">
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary" onclick="openParticipantModal('${participant.id}')" title="Edit">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteParticipant('${participant.id}', '${participant.name}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Enhanced export with Cloud Function
async function exportParticipantsCsvOptimized() {
    if (!selectedEvent) return showAlert('Select an event first', 'warning');
    
    try {
        showAlert('Preparing export...', 'info', 2000);
        
        // Use Cloud Function for export
        if (typeof firebase !== 'undefined' && firebase.functions) {
            try {
                const exportFunction = firebase.functions().httpsCallable('exportParticipantsCSV');
                const result = await exportFunction({
                    eventId: selectedEvent.id
                });
                
                // Download from Cloud Storage URL
                const a = document.createElement('a');
                a.href = result.data.downloadUrl;
                a.download = `participants-${selectedEvent.id}-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                
                showAlert(`Export completed! ${result.data.recordCount} participants exported.`, 'success');
                return;
            } catch (error) {
                console.error('Cloud Function export failed, falling back to local:', error);
                // Fall through to local export
            }
        }
        
        // Fallback to local export
        if (!participantsManager) {
            showAlert('Participants manager not available', 'warning');
            return;
        }
        
        const csvData = await participantsManager.exportToCsv({
            includeCustomFields: true,
            compression: true
        });
        
        // Create and download file
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants-${selectedEvent.id}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showAlert('Export completed successfully!', 'success');
        
    } catch (error) {
        showAlert('Export failed: ' + error.message, 'danger');
    }
}

// Local CSV export (from fully loaded cache, zero reads)
async function exportParticipantsCsvLocal() {
    try {
        const base = participantsManager
            ? (participantsManager.getCachedParticipants() || [])
            : (participantsCache || []);

        const extraFields = (selectedEvent?.data?.participantFields || []);
        const customKeys = extraFields.map(f => f.key);

        const headers = ['name', 'email', ...customKeys, 'certificateStatus', 'createdAt', 'downloadedAt'];
        const rows = [headers.join(',')];

        const toIso = (v) => v?.toDate?.()?.toISOString?.() || (v instanceof Date ? v.toISOString() : '');

        base.forEach(p => {
            const line = headers.map(h => {
                let val = '';
                if (h === 'name') val = p.name || '';
                else if (h === 'email') val = p.email || '';
                else if (h === 'certificateStatus') val = p.certificateStatus || 'pending';
                else if (h === 'createdAt') val = toIso(p.createdAt);
                else if (h === 'downloadedAt') val = toIso(p.downloadedAt);
                else val = (p.additionalFields || {})[h] || '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            rows.push(line.join(','));
        });

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants-${selectedEvent.id}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showAlert(`Exported ${base.length} rows from local cache`, 'success');
    } catch (e) {
        showAlert('Local export failed: ' + e.message, 'danger');
    }
}

// Live updates toggle: attach/detach a per-collection listener
let __liveUnsub = null;
async function toggleLiveUpdates(enable) {
    try {
        if (__liveUnsub) { 
            if (typeof __liveUnsub === 'function') {
                __liveUnsub(); 
            } else if (__liveUnsub.off) {
                __liveUnsub.off();
            }
            __liveUnsub = null; 
        }
        if (!enable) return showAlert('Live updates off', 'info', 1500);
        if (!selectedEvent || !realtimeDb) return;
        
        // Use Realtime DB for change notifications instead of Firestore onSnapshot
        const changesRef = realtimeDb.ref(`events/${selectedEvent.id}/participants/changes`);
        
        // Use 'value' listener to watch all changes, then process each child
        // This is more reliable than 'child_added' which can have issues
        const processChange = async (snapshot) => {
            if (!snapshot || !snapshot.exists()) return;
            
            const change = snapshot.val();
            if (!change || !change.participantId) return;
            
            try {
                
                const participantId = change.participantId;
                let changed = false;
                
                if (change.type === 'deleted') {
                    // Remove from cache
                    participantsCache = (participantsCache || []).filter(x => x.id !== participantId);
                    changed = true;
                    
                    // Update participantsManager cache
                    if (participantsManager) {
                        participantsManager.participantsCache.delete(participantId);
                    }
                    
                    // Update search index
                    if (window.__participantsLocalIndex) {
                        window.__participantsLocalIndex = window.__participantsLocalIndex.filter(x => x.id !== participantId);
                    }
                } else if (change.type === 'added' || change.type === 'updated') {
                    // Always fetch full document from Firestore for consistency
                    try {
                        const doc = await db.collection('events').doc(selectedEvent.id)
                            .collection('participants').doc(participantId).get();
                        if (doc.exists) {
                            const p = { id: doc.id, ...doc.data() };
                            const idx = (participantsCache || []).findIndex(x => x.id === participantId);
                            if (idx === -1) {
                                participantsCache.push(p);
                            } else {
                                participantsCache[idx] = p;
                            }
                            changed = true;
                            
                            // Update participantsManager cache
                            if (participantsManager) {
                                participantsManager.participantsCache.set(participantId, p);
                            }
                            
                            // Update search index
                            if (window.__participantsLocalIndex) {
                                const searchIdx = window.__participantsLocalIndex.findIndex(x => x.id === participantId);
                                if (searchIdx >= 0) {
                                    window.__participantsLocalIndex[searchIdx] = {
                                        id: p.id,
                                        name: (p.name || '').toLowerCase(),
                                        email: (p.email || '').toLowerCase()
                                    };
                                } else {
                                    window.__participantsLocalIndex.push({
                                        id: p.id,
                                        name: (p.name || '').toLowerCase(),
                                        email: (p.email || '').toLowerCase()
                                    });
                                }
                            }
                        }
                    } catch (fetchError) {
                        // Failed to fetch participant document
                    }
                }
                
                // Always re-render if cache changed
                if (changed) {
                    renderParticipantsFromCache();
                    el('participantsCount').innerText = participantsCache.length;
                }
            } catch (error) {
                // Error processing live update
            }
        };
        
        // Listen to all changes and process each child
        const listener = changesRef.on('child_added', (snapshot) => {
            if (snapshot) {
                processChange(snapshot);
            }
        });
        
        // Also listen for child_changed and child_removed
        const listenerChanged = changesRef.on('child_changed', (snapshot) => {
            if (snapshot) {
                processChange(snapshot);
            }
        });
        
        const listenerRemoved = changesRef.on('child_removed', (snapshot) => {
            if (snapshot) {
                processChange(snapshot);
            }
        });
        
        // Store unsubscribe function
        __liveUnsub = () => {
            changesRef.off('child_added', listener);
            changesRef.off('child_changed', listenerChanged);
            changesRef.off('child_removed', listenerRemoved);
        };
        
        showAlert('Live updates on (Realtime DB)', 'success', 1500);
    } catch (e) {
        showAlert('Live updates failed: ' + e.message, 'danger');
    }
}

// Quick status filter helper
function applyQuickStatus(status) {
    const sel = el('participantsStatusFilter');
    if (!sel) return;
    sel.value = status || '';
    renderParticipantsFromCache();
}

// Enhanced bulk upload with progress tracking
async function uploadBulkParticipantsOptimized() {
    if (!bulkRows.length || !participantsManager) return;
    
    try {
        // Show progress section
        document.getElementById('bulkPreview').classList.add('d-none');
        document.getElementById('bulkProgress').classList.remove('d-none');
        document.getElementById('bulkImportBtn').disabled = true;
        document.getElementById('bulkCloseBtn').disabled = true;
        
        // Initialize progress tracking
        const progressBar = document.getElementById('progressBar');
        const progressPercentage = document.getElementById('progressPercentage');
        const processedCount = document.getElementById('processedCount');
        const successCount = document.getElementById('successCount');
        const totalCount = document.getElementById('totalCount');
        
        totalCount.textContent = bulkRows.length;
        
        // Prepare participants data
        const participants = bulkRows.map(row => ({
            name: row.name,
            email: row.email,
            certificateStatus: 'pending',
            additionalFields: Object.fromEntries(
                Object.entries(row).filter(([key]) => !['name', 'email', '_dupCSV', '_exists'].includes(key))
            )
        }));
        
        // Use Cloud Function for bulk upload with Realtime DB progress tracking
        if (typeof firebase !== 'undefined' && firebase.functions && realtimeDb) {
            try {
                const bulkUploadFunction = firebase.functions().httpsCallable('bulkUploadParticipants');
                
                // Listen to progress updates from Realtime Database
                const progressRef = realtimeDb.ref(`bulkUploads/${currentUser.uid}/progress`);
                const progressListener = progressRef.on('value', (snapshot) => {
                    const progress = snapshot.val();
                    if (progress) {
                        const percentage = Math.round(progress.percentage || 0);
                        progressBar.style.width = percentage + '%';
                        progressPercentage.textContent = percentage + '%';
                        processedCount.textContent = progress.processed || 0;
                        successCount.textContent = progress.processed || 0;
                    }
                });
                
                // Call Cloud Function
                const result = await bulkUploadFunction({
                    eventId: selectedEvent.id,
                    participants: participants
                });
                
                // Remove progress listener
                progressRef.off('value', progressListener);
                
                // Complete progress
                progressBar.style.width = '100%';
                progressPercentage.textContent = '100%';
                processedCount.textContent = result.data.processed;
                successCount.textContent = result.data.processed;
                
                showAlert(`Successfully uploaded ${result.data.processed} participants!`, 'success');
                
                // Reload participants to get updated data
                await loadParticipants();
                
                // Close modal and reset after a short delay
                setTimeout(() => {
                    bulkUploadModal.hide();
                    resetBulkUploadModal();
                }, 2000);
                return;
            } catch (error) {
                console.error('Cloud Function bulk upload failed:', error);
                showAlert('Bulk upload failed: ' + error.message, 'danger');
                // Fall through to local upload as fallback
            }
        }
        
        // Fallback to local bulk upload manager
        const result = await participantsManager.bulkUpload(participants, (progress) => {
            // Update progress UI
            const percentage = Math.round(progress.percentage);
            progressBar.style.width = percentage + '%';
            progressPercentage.textContent = percentage + '%';
            processedCount.textContent = progress.processed;
            successCount.textContent = progress.processed; // Assuming all processed are successful for now
        });
        
        // Complete progress
        progressBar.style.width = '100%';
        progressPercentage.textContent = '100%';
        processedCount.textContent = result.processed;
        successCount.textContent = result.processed;
        
        showAlert(`Successfully imported ${result.processed} participants!`, 'success');
        
        // Close modal and reset after a short delay
        setTimeout(() => {
            bulkUploadModal.hide();
            resetBulkUploadModal();
        }, 2000);
        
    } catch (error) {
        showAlert('Bulk import failed: ' + error.message, 'danger');
        resetBulkUploadModal();
    }
}

function resetBulkUploadModal() {
    bulkRows = [];
    existingByEmail = {};
    document.getElementById('bulkCsvInput').value = '';
    document.getElementById('bulkPreview').classList.add('d-none');
    document.getElementById('bulkProgress').classList.add('d-none');
    document.getElementById('bulkImportBtn').disabled = true;
    document.getElementById('bulkCloseBtn').disabled = false;
    document.getElementById('bulkImportBtn').innerHTML = '<i class="fa-solid fa-upload me-1"></i>Import Participants';
    
    // Reset progress
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressPercentage').textContent = '0%';
    document.getElementById('processedCount').textContent = '0';
    document.getElementById('successCount').textContent = '0';
    document.getElementById('totalCount').textContent = '0';
}

// Initialize optimized features when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    try {
        setupSearchWithDebounce();
    } catch (error) {
        console.error('Error setting up search debounce:', error);
    }
});

// Migration function to populate initial counters
async function runMigration() {
    if (!currentUser) {
        showAlert('Please sign in first', 'warning');
        return;
    }
    
    try {
        showAlert('Starting migration... This may take a moment.', 'info');
        
        const migrateFunction = firebase.functions().httpsCallable('migrateCounters');
        const result = await migrateFunction({});
        
        if (result.data.success) {
            showAlert(
                `Migration complete! Processed ${result.data.processed} events. ${result.data.errors > 0 ? `(${result.data.errors} errors)` : ''}`,
                'success'
            );
            // Reload events to show updated counts
            loadEvents();
        } else {
            showAlert('Migration failed: ' + (result.data.message || 'Unknown error'), 'danger');
        }
        } catch (error) {
            showAlert('Migration failed: ' + error.message, 'danger');
        }
}

// Make functions globally available
window.signIn = signIn;
window.signOut = signOut;
window.showApp = showApp;
window.showGate = showGate;
window.runMigration = runMigration; // Make migration function available globally

// Ensure gate screen is shown initially
document.addEventListener('DOMContentLoaded', function() {
    const gateScreen = document.getElementById('gateScreen');
    const appContainer = document.getElementById('appContainer');
    
    if (gateScreen && appContainer) {
        // Show gate screen initially
        gateScreen.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// Admin Management
async function loadAdmins() {
    const tbody = document.querySelector('#adminsTable tbody');
    if (!tbody) return;
    
    // If cache is empty, load from database
    if (adminsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading admins...</div></td></tr>';
        
        try {
            // Try to load from Realtime DB first (free reads)
            if (realtimeDb) {
                try {
                    const adminsRef = realtimeDb.ref('admins/list');
                    const snapshot = await adminsRef.once('value');
                    const adminsList = snapshot.val();
                    
                    if (adminsList && Array.isArray(adminsList) && adminsList.length > 0) {
                        adminsCache = adminsList.map(admin => ({
                            id: admin.id,
                            email: admin.email,
                            createdAt: admin.createdAt ? { seconds: Math.floor(admin.createdAt / 1000) } : null
                        }));
                        renderAdminsFromCache();
                        return;
                    }
                } catch (rtdbError) {
                    // Fallback to Firestore
                }
            }
            
            const snap = await db.collection('admins').orderBy('createdAt', 'desc').get();
            adminsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            tbody.innerHTML = `
                <tr><td colspan="3" class="empty-state">
                    <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                    <h6 class="mt-2">Error loading admins</h6>
                    <p class="mb-0 text-danger">${error.message}</p>
                </td></tr>`;
            return;
        }
    }
    
    // Render from cache
    renderAdminsFromCache();
}

function renderAdminsFromCache() {
    const tbody = document.querySelector('#adminsTable tbody');
    if (!tbody || !adminsCache) return;
    
    if (adminsCache.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="empty-state">
                <i class="fa-solid fa-user-shield"></i>
                <h6 class="mt-2">No admins found</h6>
                <p class="mb-0">Invite your first admin to get started</p>
            </td></tr>
        `;
        return;
    }
    
    tbody.innerHTML = adminsCache.map(admin => {
        const isCurrentUser = admin.id === currentUser?.uid;
        
        return `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <i class="fa-solid fa-envelope text-muted"></i>
                        <span class="fw-semibold">${admin.email || 'Unknown'}</span>
                        ${isCurrentUser ? '<span class="badge bg-primary">You</span>' : ''}
                    </div>
                </td>
                <td>
                    <div class="text-muted small">
                        ${admin.createdAt ? new Date(admin.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                    </div>
                </td>
                <td class="text-end">
                    ${!isCurrentUser ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmRemoveAdmin('${admin.id}','${admin.email}')" title="Remove Admin">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    ` : '<span class="text-muted small">Cannot remove yourself</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

async function loadInvites() {
    const tbody = document.querySelector('#invitesTable tbody');
    if (!tbody) return;
    
    // If cache is empty, load from database
    if (invitesCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading invites...</div></td></tr>';
        
        try {
            // Try to load from Realtime DB first (free reads)
            if (realtimeDb) {
                try {
                    const invitesRef = realtimeDb.ref('invites/list');
                    const snapshot = await invitesRef.once('value');
                    const invitesList = snapshot.val();
                    
                    if (invitesList && Array.isArray(invitesList) && invitesList.length > 0) {
                        invitesCache = invitesList.map(invite => ({
                            id: invite.id,
                            email: invite.email,
                            createdAt: invite.createdAt ? { seconds: Math.floor(invite.createdAt / 1000) } : null
                        }));
                        renderInvitesFromCache();
                        return;
                    }
                } catch (rtdbError) {
                }
            }
            
            // Fallback to Firestore
            const snap = await db.collection('invites').orderBy('createdAt', 'desc').get();
            invitesCache = snap.docs.map(doc => ({ id: doc.id, email: doc.id, ...doc.data() }));
        } catch (error) {
            tbody.innerHTML = `
                <tr><td colspan="3" class="empty-state">
                    <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                    <h6 class="mt-2">Error loading invites</h6>
                    <p class="mb-0 text-danger">${error.message}</p>
                </td></tr>`;
            return;
        }
    }
    
    // Render from cache
    renderInvitesFromCache();
}

function renderInvitesFromCache() {
    const tbody = document.querySelector('#invitesTable tbody');
    if (!tbody || !invitesCache) return;
    
    if (invitesCache.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="empty-state">
                <i class="fa-solid fa-envelope-open"></i>
                <h6 class="mt-2">No pending invites</h6>
                <p class="mb-0">All invitations have been accepted</p>
            </td></tr>`;
        return;
    }
    
    tbody.innerHTML = invitesCache.map(invite => {
        return `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <i class="fa-solid fa-envelope text-warning"></i>
                        <span class="fw-semibold">${invite.id}</span>
                    </div>
                </td>
                <td>
                    <div class="text-muted small">
                        ${invite.createdAt ? new Date(invite.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                    </div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger" onclick="confirmRevokeInvite('${invite.id}')" title="Revoke Invite">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function inviteAdminByEmail() {
    const email = el('newAdminEmail').value.trim().toLowerCase();
    if (!email) return showAlert('Please enter an email address', 'warning');
    
    if (!email.includes('@')) return showAlert('Please enter a valid email address', 'warning');
    
    try {
        // Check if already an admin using cache
        const existingAdmin = adminsCache.find(admin => admin.email === email);
        if (existingAdmin) {
            showAlert('This email is already an admin', 'warning');
            return;
        }
        
        // Check if already invited using cache
        const existingInvite = invitesCache.find(invite => invite.id === email);
        if (existingInvite) {
            showAlert('This email has already been invited', 'warning');
            return;
        }
        
        // Create invite
        await db.collection('invites').doc(email).set({
            email: email,
            invitedBy: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update cache
        invitesCache.push({ 
            id: email, 
            email: email, 
            invitedBy: currentUser.email, 
            createdAt: new Date() 
        });
        
        el('newAdminEmail').value = '';
        showAlert(`Invitation sent to ${email}`, 'success');
        
        // Update UI from cache
        renderInvitesFromCache();
        
    } catch (error) {
        showAlert('Failed to send invitation: ' + error.message, 'danger');
    }
}

function confirmRemoveAdmin(adminId, email) {
    showConfirm(`Remove admin access for ${email}?`, async () => {
        try {
            await db.collection('admins').doc(adminId).delete();
            
            // Update cache
            adminsCache = adminsCache.filter(admin => admin.id !== adminId);
            
            // Update UI from cache
            renderAdminsFromCache();
            
            showAlert('Admin access removed', 'success');
        } catch (error) {
            showAlert('Failed to remove admin: ' + error.message, 'danger');
        }
    });
}

function confirmRevokeInvite(email) {
    showConfirm(`Revoke invitation for ${email}?`, async () => {
        try {
            await db.collection('invites').doc(email).delete();
            
            // Update cache
            invitesCache = invitesCache.filter(invite => invite.id !== email);
            
            // Update UI from cache
            renderInvitesFromCache();
            
            showAlert('Invitation revoked', 'success');
        } catch (error) {
            showAlert('Failed to revoke invitation: ' + error.message, 'danger');
        }
    });
}

window.loadAdmins = loadAdmins;
window.renderAdminsFromCache = renderAdminsFromCache;
window.loadInvites = loadInvites;
window.renderInvitesFromCache = renderInvitesFromCache;
window.inviteAdminByEmail = inviteAdminByEmail;
window.confirmRemoveAdmin = confirmRemoveAdmin;
window.confirmRevokeInvite = confirmRevokeInvite;
window.refreshCertificateCount = refreshCertificateCount;
