// Firebase Configuration and Initialization
const firebaseConfig = {
    apiKey: "AIzaSyAnwGIka86C74YsqCNwCwqTebYcynjaK2k",
    authDomain: "rsacertify.firebaseapp.com",
    projectId: "rsacertify",
    storageBucket: "rsacertify.firebasestorage.app",
    messagingSenderId: "623867096357",
    appId: "1:623867096357:web:8af2600adc0145b14dfecc",
    measurementId: "G-RTT3BLGHYN"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let selectedEvent = null;
let participantsCache = [];
let participantsSortKey = 'name';
let participantsSortDir = 'asc';
let bulkRows = [];
let existingByEmail = {};

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

function signOut() { 
    auth.signOut(); 
}

// Setup authentication
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) { 
        showGate('Sign in to continue.'); 
        return;
    }
    
    try {
        el('signinBtn').classList.add('d-none');
        el('signoutBtn').classList.remove('d-none');
        
        // UID-based admin gating with invite auto-promotion
        const adminDoc = await db.collection('admins').doc(user.uid).get();
        if (!adminDoc.exists) {
            const inviteDoc = await db.collection('invites').doc((user.email || '').toLowerCase()).get();
            if (inviteDoc.exists) {
                await db.collection('admins').doc(user.uid).set({ 
                    email: (user.email || '').toLowerCase(), 
                    createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });
                await db.collection('invites').doc((user.email || '').toLowerCase()).delete().catch(() => {});
            }
        }
        
        const check = await db.collection('admins').doc(user.uid).get();
        if (!check.exists) { 
            showGate('Access denied. Ask an existing admin to invite you.'); 
            await auth.signOut().catch(() => {}); 
            return; 
        }
        
        showApp();
        loadEvents();
        loadAdmins();
        loadInvites();
        
    } catch (error) {
        showGate('Error verifying admin access: ' + error.message);
        await auth.signOut().catch(() => {});
    }
});

// Tab switching functionality
function switchTab(name) {
    el('eventsSection').classList.toggle('d-none', name !== 'events');
    el('participantsSection').classList.toggle('d-none', name !== 'participants');
    el('adminsSection').classList.toggle('d-none', name !== 'admins');
    el('tab-events').classList.toggle('active', name === 'events');
    el('tab-participants').classList.toggle('active', name === 'participants');
    el('tab-admins').classList.toggle('active', name === 'admins');
}

// Events Management
async function loadEvents() {
    const tbody = document.querySelector('#eventsTable tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading events...</div></td></tr>';
    
    try {
        const snap = await db.collection('events').get();
        const docs = [...snap.docs].sort((a,b) => {
            const ea = a.data() || {};
            const eb = b.data() || {};
            const ta = (ea.updatedAt?.seconds || ea.createdAt?.seconds || 0);
            const tb = (eb.updatedAt?.seconds || eb.createdAt?.seconds || 0);
            return tb - ta;
        });
        
        const rows = [];
        
        // Process each event and get real-time participant and certificate counts
        for (const doc of docs) {
            const e = doc.data();
            
            // Get real-time participant count and certificate count
            const participantsSnap = await db.collection('events').doc(doc.id).collection('participants').get();
            const participantsCount = participantsSnap.size;
            const certificatesCount = participantsSnap.docs.filter(participantDoc => {
                const participantData = participantDoc.data();
                return participantData.certificateStatus === 'downloaded';
            }).length;
            
            // Update the event document with real-time counts
            await db.collection('events').doc(doc.id).set({
                participantsCount: participantsCount,
                certificatesCount: certificatesCount
            }, { merge: true });
            
            rows.push(`<tr>
                <td>
                    <div class="fw-semibold fs-6">${e.title || '(untitled)'}</div>
                    <div class="text-muted small">
                        <i class="fa-solid fa-calendar me-1"></i>${e.date || 'No date set'}
                    </div>
                    <div class="text-muted small">
                        <i class="fa-solid fa-hashtag me-1"></i>${doc.id}
                    </div>
                </td>
                        <td>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary fs-6">${participantsCount}</span>
                                <span class="text-muted small">participants</span>
                            </div>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-success fs-6">${certificatesCount}</span>
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
                        <button class="btn btn-sm btn-outline-primary" onclick="openEventModal('${doc.id}')" title="Edit Event">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="manageParticipants('${doc.id}')" title="Manage Participants">
                            <i class="fa-solid fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteEvent('${doc.id}','${(e.title || '').replace(/\"/g,'\\\"')}')" title="Delete Event">
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
        if (el('totalEvents')) { el('totalEvents').innerText = docs.length; }
        
    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="5" class="empty-state">
                <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                <h6 class="mt-2">Error loading events</h6>
                <p class="mb-0 text-danger">${error.message}</p>
            </td></tr>`;
    }
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
        loadEvents();
    } catch (e) {
        showAlert('Failed: ' + e.message, 'danger');
    }
}

function confirmDeleteEvent(id, title) {
    showConfirm(`Delete event "${title}" and all its participants?`, async () => {
        await deleteEventCascade(id);
        loadEvents();
    });
}

async function deleteEventCascade(eventId) {
    const parts = await db.collection('events').doc(eventId).collection('participants').get(); 
    const batch = db.batch(); 
    parts.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('events').doc(eventId)); 
    await batch.commit();
}

        function manageParticipants(eventId) {
    db.collection('events').doc(eventId).get().then(doc => { 
                selectedEvent = { id: doc.id, data: doc.data() };
        el('participantsEventName').innerText = selectedEvent.data.title || selectedEvent.data.slug || selectedEvent.id; 
                renderParticipantsTableHead();
                switchTab('participants');
                loadParticipants();
    }); 
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
window.openEventModal = openEventModal;
window.saveEvent = saveEvent;
window.confirmDeleteEvent = confirmDeleteEvent;
window.manageParticipants = manageParticipants;
window.addEventFieldRow = addEventFieldRow;
window.removeEventField = removeEventField;
window.normalizeEventFields = normalizeEventFields;

// Participants Management
async function loadParticipants() { 
    if (!selectedEvent) return; 
    
    const tbody = document.querySelector('#participantsTable tbody'); 
            const extraFields = (selectedEvent?.data?.participantFields || []);
    const totalColumns = 4 + extraFields.length; // Name, Email, Custom Fields, Certificate Status, Actions
            tbody.innerHTML = `<tr><td colspan="${totalColumns}" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading participants...</div></td></tr>`;
            
            try {
        const snap = await db.collection('events').doc(selectedEvent.id).collection('participants').orderBy('name').get(); 
                participantsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderParticipantsFromCache();
                
                // Update participant count display
        el('participantsCount').innerText = snap.size;
        
        // Update both participant count and certificate count in event document
        const certificatesCount = snap.docs.filter(doc => {
            const data = doc.data();
            return data.certificateStatus === 'downloaded';
        }).length;
        
        await db.collection('events').doc(selectedEvent.id).set({
                    participantsCount: snap.size,
                    certificatesCount: certificatesCount
                }, { merge: true });
                
        // Restore sort state after loading participants
        updateSortIcons();
                
            } catch (error) {
                const extraFields = (selectedEvent?.data?.participantFields || []);
                const totalColumns = 4 + extraFields.length;
                tbody.innerHTML = `
                    <tr><td colspan="${totalColumns}" class="empty-state">
                        <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                        <h6 class="mt-2">Error loading participants</h6>
                        <p class="mb-0 text-danger">${error.message}</p>
                    </td></tr>`;
            }
        }

const participantModal = new bootstrap.Modal(document.getElementById('participantModal'));
function openParticipantModal(id) {
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
        db.collection('events').doc(selectedEvent.id).collection('participants').doc(id).get().then(d => { 
            const p = d.data();
            el('participantName').value = p.name || '';
            el('participantEmail').value = p.email || '';
            
            // Load custom fields
            (selectedEvent.data.participantFields || []).forEach(f => {
                const v = (p.additionalFields || {})[f.key] || '';
                const input = document.getElementById('pf_' + f.key);
                if (input) input.value = v;
            });
            
            participantModal.show(); 
        });
    } else {
        participantModal.show(); 
    }
}

async function saveParticipant() {
    const eventId = el('participantEventId').value;
    const id = el('participantId').value || undefined;
    const email = el('participantEmail').value.trim().toLowerCase();
    
    const payload = {
        name: el('participantName').value.trim(),
        email: email,
        certificateStatus: 'pending', // Always set certificate status
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    };
    
    if (!payload.name || !payload.email) return showAlert('Name and email are required', 'warning'); 
    
    // Check for duplicate email (only for new participants)
    if (!id) {
        const existing = await db.collection('events').doc(eventId).collection('participants').where('email', '==', email).limit(1).get();
        if (!existing.empty) {
            showAlert('A participant with this email already exists in this event.', 'warning');
            return;
        }
    }
    
    // collect extras
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
        if (id) {
            await db.collection('events').doc(eventId).collection('participants').doc(id).set(payload, { merge: true }); 
        } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(); 
            await db.collection('events').doc(eventId).collection('participants').add(payload); 
        }
        participantModal.hide(); 
        loadParticipants();
    } catch (e) {
        showAlert('Failed: ' + e.message, 'danger');
    }
}

function confirmDeleteParticipant(id, name) {
    showConfirm(`Delete participant "${name}"?`, async () => {
        await db.collection('events').doc(selectedEvent.id).collection('participants').doc(id).delete(); 
        loadParticipants();
    });
}

window.loadParticipants = loadParticipants;
window.openParticipantModal = openParticipantModal;
window.saveParticipant = saveParticipant;
window.confirmDeleteParticipant = confirmDeleteParticipant;

// Participants Rendering and Filtering
function renderParticipantsFromCache() {
    const tbody = document.querySelector('#participantsTable tbody');
    if (!tbody) return;
    
    const { q, status } = getParticipantsFilters();
    let data = participantsCache.slice();
    
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
    
    // Apply sorting
    data.sort((a, b) => {
        const av = (a[participantsSortKey] || '').toString().toLowerCase();
        const bv = (b[participantsSortKey] || '').toString().toLowerCase();
        return participantsSortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? 1 : -1);
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
            ? '<span class="status-badge success"><i class="fa-solid fa-check me-1"></i>Downloaded</span>'
            : '<span class="status-badge pending"><i class="fa-solid fa-clock me-1"></i>Pending</span>';
        
        return `<tr>
            <td><div class="fw-semibold">${p.name || '—'}</div></td>
            <td><div class="text-muted">${p.email || '—'}</div></td>
            ${customFieldsHtml}
            <td>${statusBadge}</td>
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
                
                // Get existing participants for duplicate detection
                const existingSnap = await db.collection('events').doc(selectedEvent.id).collection('participants').get();
                existingByEmail = {};
                existingSnap.forEach(doc => {
                    const data = doc.data();
                    existingByEmail[data.email?.toLowerCase() || ''] = doc.id;
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
    
        showAlert(`Successfully imported ${imported} participants`, 'success');
        bulkUploadModal.hide();
        loadParticipants();
        
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

// Admin Management
async function loadAdmins() {
    const tbody = document.querySelector('#adminsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading admins...</div></td></tr>';
    
    try {
        const snap = await db.collection('admins').orderBy('createdAt', 'desc').get();
        
        if (snap.empty) {
            tbody.innerHTML = `
                <tr><td colspan="3" class="empty-state">
                    <i class="fa-solid fa-user-shield"></i>
                    <h6 class="mt-2">No admins found</h6>
                    <p class="mb-0">Invite your first admin to get started</p>
                </td></tr>`;
            return;
        }
        
        tbody.innerHTML = snap.docs.map(doc => {
            const admin = doc.data();
            const isCurrentUser = doc.id === currentUser?.uid;
            
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
                            <button class="btn btn-sm btn-outline-danger" onclick="confirmRemoveAdmin('${doc.id}','${admin.email}')" title="Remove Admin">
                                <i class="fa-regular fa-trash-can"></i>
                        </button>
                        ` : '<span class="text-muted small">Cannot remove yourself</span>'}
                </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="empty-state">
                <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                <h6 class="mt-2">Error loading admins</h6>
                <p class="mb-0 text-danger">${error.message}</p>
            </td></tr>`;
    }
}

async function loadInvites() {
    const tbody = document.querySelector('#invitesTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="loading-spinner mx-auto"></div><div class="mt-2 text-muted">Loading invites...</div></td></tr>';
    
    try {
        const snap = await db.collection('invites').orderBy('createdAt', 'desc').get();
        
        if (snap.empty) {
            tbody.innerHTML = `
                <tr><td colspan="3" class="empty-state">
                    <i class="fa-solid fa-envelope-open"></i>
                    <h6 class="mt-2">No pending invites</h6>
                    <p class="mb-0">All invitations have been accepted</p>
                </td></tr>`;
        return;
    }
    
        tbody.innerHTML = snap.docs.map(doc => {
            const invite = doc.data();
            
            return `
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <i class="fa-solid fa-envelope text-warning"></i>
                            <span class="fw-semibold">${doc.id}</span>
                        </div>
                    </td>
                    <td>
                        <div class="text-muted small">
                            ${invite.createdAt ? new Date(invite.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                        </div>
                    </td>
                <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmRevokeInvite('${doc.id}')" title="Revoke Invite">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="empty-state">
                <i class="fa-solid fa-exclamation-triangle text-danger"></i>
                <h6 class="mt-2">Error loading invites</h6>
                <p class="mb-0 text-danger">${error.message}</p>
            </td></tr>`;
    }
}

async function inviteAdminByEmail() {
    const email = el('newAdminEmail').value.trim().toLowerCase();
    if (!email) return showAlert('Please enter an email address', 'warning');
    
    if (!email.includes('@')) return showAlert('Please enter a valid email address', 'warning');
    
    try {
        // Check if already an admin
        const adminSnap = await db.collection('admins').where('email', '==', email).limit(1).get();
        if (!adminSnap.empty) {
            showAlert('This email is already an admin', 'warning');
            return;
        }
        
        // Check if already invited
        const inviteDoc = await db.collection('invites').doc(email).get();
        if (inviteDoc.exists) {
            showAlert('This email has already been invited', 'warning');
            return;
        }
        
        // Create invite
        await db.collection('invites').doc(email).set({
            email: email,
            invitedBy: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        el('newAdminEmail').value = '';
        showAlert(`Invitation sent to ${email}`, 'success');
        loadInvites();
        
    } catch (error) {
        showAlert('Failed to send invitation: ' + error.message, 'danger');
    }
}

function confirmRemoveAdmin(adminId, email) {
    showConfirm(`Remove admin access for ${email}?`, async () => {
        try {
            await db.collection('admins').doc(adminId).delete();
            showAlert('Admin access removed', 'success');
            loadAdmins();
        } catch (error) {
            showAlert('Failed to remove admin: ' + error.message, 'danger');
        }
    });
}

function confirmRevokeInvite(email) {
    showConfirm(`Revoke invitation for ${email}?`, async () => {
        try {
            await db.collection('invites').doc(email).delete();
            showAlert('Invitation revoked', 'success');
            loadInvites();
        } catch (error) {
            showAlert('Failed to revoke invitation: ' + error.message, 'danger');
        }
    });
}

window.loadAdmins = loadAdmins;
window.loadInvites = loadInvites;
window.inviteAdminByEmail = inviteAdminByEmail;
window.confirmRemoveAdmin = confirmRemoveAdmin;
window.confirmRevokeInvite = confirmRevokeInvite;
