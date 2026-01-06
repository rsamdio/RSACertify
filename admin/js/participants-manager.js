// Optimized Participants Manager with Firebase Performance Enhancements
class ParticipantsManager {
    constructor() {
        this.pageSize = 50;
        this.lastDoc = null;
        this.hasMore = true;
        this.participantsCache = new Map();
        this.cache = new ParticipantsCache();
        this.realtimeManager = new RealTimeParticipantsManager();
        this.bulkManager = new BulkUploadManager();
        this.exporter = new ParticipantsExporter();
        this.currentEventId = null;
        this.filters = { q: '', status: '' };
        this.sortKey = 'name';
        this.sortDir = 'asc';
    }

    // Initialize participants management for an event
    async initialize(eventId) {
        this.currentEventId = eventId;
        this.resetPagination();
        this.participantsCache.clear();
        
        // Setup real-time listener
        this.realtimeManager.setupParticipantsListener(eventId);
        
        // Load first page
        await this.loadParticipantsPage();
    }

    // Load participants with pagination
    async loadParticipantsPage(page = 1, filters = {}) {
        if (!this.currentEventId) return [];

        try {
            this.filters = { ...this.filters, ...filters };
            
            let query = db.collection('events').doc(this.currentEventId)
                .collection('participants')
                .orderBy(this.sortKey, this.sortDir)
                .limit(this.pageSize);
            
            // Apply filters
            if (this.filters.status) {
                query = query.where('certificateStatus', '==', this.filters.status);
            }
            
            // Pagination
            if (page > 1 && this.lastDoc) {
                query = query.startAfter(this.lastDoc);
            }
            
            const snapshot = await query.get();
            
            if (snapshot.empty) {
                this.hasMore = false;
                return [];
            }
            
            this.lastDoc = snapshot.docs[snapshot.docs.length - 1];
            this.hasMore = snapshot.docs.length === this.pageSize;
            
            const participants = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Update cache
            participants.forEach(p => {
                this.participantsCache.set(p.id, p);
                this.cache.set(p.id, p);
            });
            
            return participants;
            
        } catch (error) {
            console.error('Error loading participants:', error);
            throw error;
        }
    }

    // Search participants with caching
    async searchParticipants(query) {
        if (!query || query.length < 2) {
            return Array.from(this.participantsCache.values());
        }

        // Try cache first
        const cachedResults = this.cache.search(query);
        if (cachedResults.length > 0) {
            return cachedResults;
        }

        // Fallback to database search
        try {
            const snapshot = await db.collection('events').doc(this.currentEventId)
                .collection('participants')
                .where('name', '>=', query)
                .where('name', '<=', query + '\uf8ff')
                .limit(20)
                .get();

            const results = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Cache results
            results.forEach(p => this.cache.set(p.id, p));

            return results;
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    // Add or update participant
    async saveParticipant(participantData, isUpdate = false) {
        if (!this.currentEventId) throw new Error('No event selected');

        try {
            // Remove id from payload - it's the document ID, not a field
            const { id, ...dataWithoutId } = participantData;
            
            const payload = {
                ...dataWithoutId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            let docRef;
            if (isUpdate && id) {
                // Update existing
                docRef = db.collection('events').doc(this.currentEventId)
                    .collection('participants').doc(id);
                await docRef.set(payload, { merge: true });
            } else {
                // Create new
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                docRef = await db.collection('events').doc(this.currentEventId)
                    .collection('participants').add(payload);
            }

            const participant = { id: docRef.id, ...payload };
            
            // Update cache
            this.participantsCache.set(participant.id, participant);
            this.cache.set(participant.id, participant);

            return participant;
        } catch (error) {
            console.error('Error saving participant:', error);
            throw error;
        }
    }

    // Delete participant
    async deleteParticipant(participantId) {
        if (!this.currentEventId) throw new Error('No event selected');

        try {
            await db.collection('events').doc(this.currentEventId)
                .collection('participants').doc(participantId).delete();

            // Remove from cache
            this.participantsCache.delete(participantId);
            this.cache.delete(participantId);

            return true;
        } catch (error) {
            console.error('Error deleting participant:', error);
            throw error;
        }
    }

    // Bulk upload participants
    async bulkUpload(participants, onProgress) {
        if (!this.currentEventId) throw new Error('No event selected');

        try {
            const result = await this.bulkManager.uploadBulkParticipants(
                this.currentEventId, 
                participants, 
                onProgress
            );

            // Refresh cache after bulk upload
            await this.refreshCache();

            return result;
        } catch (error) {
            console.error('Bulk upload error:', error);
            throw error;
        }
    }

    // Export participants to CSV
    async exportToCsv(options = {}) {
        if (!this.currentEventId) throw new Error('No event selected');

        try {
            return await this.exporter.exportParticipantsCsv(this.currentEventId, options);
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    // Refresh cache from database
    async refreshCache() {
        this.resetPagination();
        this.participantsCache.clear();
        return await this.loadParticipantsPage();
    }

    // Reset pagination
    resetPagination() {
        this.lastDoc = null;
        this.hasMore = true;
    }

    // Get cached participants
    getCachedParticipants() {
        return Array.from(this.participantsCache.values());
    }

    // Apply filters to cached data
    applyFilters(participants, filters) {
        let filtered = participants.slice();

        if (filters.q) {
            const query = filters.q.toLowerCase();
            filtered = filtered.filter(p => 
                (p.name || '').toLowerCase().includes(query) || 
                (p.email || '').toLowerCase().includes(query)
            );
        }

        if (filters.status) {
            filtered = filtered.filter(p => (p.certificateStatus || '') === filters.status);
        }

        return filtered;
    }

    // Sort participants
    sortParticipants(participants, key, direction) {
        this.sortKey = key;
        this.sortDir = direction;

        return participants.sort((a, b) => {
            const av = (a[key] || '').toString().toLowerCase();
            const bv = (b[key] || '').toString().toLowerCase();
            return direction === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? 1 : -1);
        });
    }

    // Cleanup resources
    cleanup() {
        this.realtimeManager.cleanup();
        this.participantsCache.clear();
        this.cache.clear();
    }
}

// Smart Caching Strategy
class ParticipantsCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutes
        this.maxSize = 1000;
        this.searchIndex = new Map(); // For fast searching
    }

    set(key, data) {
        // Implement LRU eviction
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });

        // Update search index
        this.updateSearchIndex(key, data);
    }

    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > this.ttl) {
            this.delete(key);
            return null;
        }

        return cached.data;
    }

    delete(key) {
        this.cache.delete(key);
        this.searchIndex.delete(key);
    }

    clear() {
        this.cache.clear();
        this.searchIndex.clear();
    }

    // Fast search within cache
    search(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const [key, participant] of this.searchIndex) {
            if (participant.searchText.includes(lowerQuery)) {
                const cached = this.cache.get(key);
                if (cached) {
                    results.push(cached.data);
                }
            }
        }

        return results;
    }

    updateSearchIndex(key, data) {
        const searchText = [
            data.name || '',
            data.email || '',
            ...Object.values(data.additionalFields || {})
        ].join(' ').toLowerCase();

        this.searchIndex.set(key, { searchText });
    }
}

// Real-time Participants Manager
class RealTimeParticipantsManager {
    constructor() {
        this.listeners = new Map();
        this.participantsCache = new Map();
    }

    setupParticipantsListener(eventId) {
        // Cleanup existing listener
        if (this.listeners.has(eventId)) {
            this.listeners.get(eventId)();
        }

        const listener = db.collection('events').doc(eventId)
            .collection('participants')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(change => {
                    const participant = { id: change.doc.id, ...change.doc.data() };
                    
                    switch (change.type) {
                        case 'added':
                        case 'modified':
                            this.participantsCache.set(participant.id, participant);
                            this.updateParticipantRow(participant);
                            break;
                        case 'removed':
                            this.participantsCache.delete(participant.id);
                            this.removeParticipantRow(participant.id);
                            break;
                    }
                });
                
                this.updateCounts();
            });
        
        this.listeners.set(eventId, listener);
    }

    updateParticipantRow(participant) {
        const row = document.querySelector(`tr[data-participant-id="${participant.id}"]`);
        if (row) {
            // Update existing row with animation
            row.style.transition = 'background-color 0.3s ease';
            row.style.backgroundColor = '#e8f5e8';
            setTimeout(() => {
                row.style.backgroundColor = '';
            }, 1000);
            
            this.renderParticipantRow(participant, row);
        } else {
            // Add new row
            this.addParticipantRow(participant);
        }
    }

    removeParticipantRow(participantId) {
        const row = document.querySelector(`tr[data-participant-id="${participantId}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease';
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
            }, 300);
        }
    }

    addParticipantRow(participant) {
        const tbody = document.querySelector('#participantsTable tbody');
        if (!tbody) return;

        const row = this.createParticipantRow(participant);
        row.style.opacity = '0';
        tbody.insertBefore(row, tbody.firstChild);
        
        // Animate in
        setTimeout(() => {
            row.style.transition = 'opacity 0.3s ease';
            row.style.opacity = '1';
        }, 100);
    }

    createParticipantRow(participant) {
        const row = document.createElement('tr');
        row.setAttribute('data-participant-id', participant.id);
        
        // This will be implemented in the main dashboard
        return row;
    }

    renderParticipantRow(participant, row) {
        // This will be implemented in the main dashboard
    }

    updateCounts() {
        const totalCount = this.participantsCache.size;
        const downloadedCount = Array.from(this.participantsCache.values())
            .filter(p => p.certificateStatus === 'downloaded').length;
        
        // Update UI counters
        const countElement = document.getElementById('participantsCount');
        if (countElement) {
            countElement.textContent = totalCount;
        }
    }

    cleanup() {
        this.listeners.forEach(listener => listener());
        this.listeners.clear();
        this.participantsCache.clear();
    }
}

// Bulk Upload Manager with Progress Tracking
class BulkUploadManager {
    constructor() {
        this.batchSize = 400; // Firestore limit is 500
        this.retryAttempts = 3;
        this.progressCallback = null;
    }

    async uploadBulkParticipants(eventId, participants, onProgress) {
        this.progressCallback = onProgress;
        const totalBatches = Math.ceil(participants.length / this.batchSize);
        let completedBatches = 0;
        let totalProcessed = 0;

        try {
            for (let i = 0; i < participants.length; i += this.batchSize) {
                const batch = participants.slice(i, i + this.batchSize);
                const batchNumber = Math.floor(i / this.batchSize) + 1;
                
                await this.processBatch(eventId, batch, batchNumber);
                
                completedBatches++;
                totalProcessed += batch.length;
                
                if (this.progressCallback) {
                    this.progressCallback({
                        completed: completedBatches,
                        total: totalBatches,
                        percentage: (completedBatches / totalBatches) * 100,
                        processed: totalProcessed,
                        totalParticipants: participants.length
                    });
                }
            }

            return { 
                success: true, 
                total: participants.length,
                processed: totalProcessed
            };

        } catch (error) {
            throw new Error(`Bulk upload failed: ${error.message}`);
        }
    }

    async processBatch(eventId, batch, batchNumber) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const firestoreBatch = db.batch();
                
                batch.forEach(participant => {
                    const docRef = db.collection('events').doc(eventId)
                        .collection('participants').doc();
                    
                    firestoreBatch.set(docRef, {
                        ...participant,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await firestoreBatch.commit();
                return; // Success

            } catch (error) {
                console.error(`Batch ${batchNumber} attempt ${attempt} failed:`, error);
                
                if (attempt === this.retryAttempts) {
                    throw error;
                }

                // Exponential backoff
                await this.delay(Math.pow(2, attempt) * 1000);
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Participants Exporter with Streaming
class ParticipantsExporter {
    async exportParticipantsCsv(eventId, options = {}) {
        const { 
            includeCustomFields = true, 
            statusFilter = null,
            compression = true 
        } = options;

        try {
            // Get event data for custom fields
            const eventDoc = await db.collection('events').doc(eventId).get();
            const eventData = eventDoc.data();
            const customFields = eventData?.participantFields || [];

            const headers = ['name', 'email'];
            if (includeCustomFields) {
                headers.push(...customFields.map(f => f.key));
            }
            headers.push('certificateStatus', 'createdAt', 'downloadedAt');

            const csvRows = [headers.join(',')];

            // Stream participants in batches
            let lastDoc = null;
            const batchSize = 100;

            while (true) {
                let query = db.collection('events').doc(eventId)
                    .collection('participants')
                    .orderBy('name')
                    .limit(batchSize);

                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                if (statusFilter) {
                    query = query.where('certificateStatus', '==', statusFilter);
                }

                const snapshot = await query.get();

                if (snapshot.empty) break;

                // Process batch
                snapshot.docs.forEach(doc => {
                    const participant = doc.data();
                    const row = this.formatParticipantRow(participant, headers);
                    csvRows.push(row.join(','));
                });

                lastDoc = snapshot.docs[snapshot.docs.length - 1];

                // Yield control to prevent blocking
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const csvContent = csvRows.join('\n');

            // Compress if requested and content is large
            if (compression && csvContent.length > 10000) {
                return this.compressCsv(csvContent);
            }

            return csvContent;

        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    formatParticipantRow(participant, headers) {
        return headers.map(header => {
            let value = '';
            
            switch (header) {
                case 'name':
                    value = participant.name || '';
                    break;
                case 'email':
                    value = participant.email || '';
                    break;
                case 'certificateStatus':
                    value = participant.certificateStatus || 'pending';
                    break;
                case 'createdAt':
                    value = participant.createdAt?.toDate?.()?.toISOString() || '';
                    break;
                case 'downloadedAt':
                    value = participant.downloadedAt?.toDate?.()?.toISOString() || '';
                    break;
                default:
                    value = participant.additionalFields?.[header] || '';
            }

            // Escape CSV values
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = `"${value.replace(/"/g, '""')}"`;
            }

            return value;
        });
    }

    compressCsv(csvContent) {
        // Simple compression - in production, use a proper compression library
        return {
            content: csvContent,
            compressed: true,
            originalSize: csvContent.length,
            compressedSize: csvContent.length // Placeholder
        };
    }
}

// Export for use in other modules
window.ParticipantsManager = ParticipantsManager;
window.ParticipantsCache = ParticipantsCache;
window.RealTimeParticipantsManager = RealTimeParticipantsManager;
window.BulkUploadManager = BulkUploadManager;
window.ParticipantsExporter = ParticipantsExporter;
