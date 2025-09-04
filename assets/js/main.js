// Enhanced Main JavaScript Module
class CertificateManager {
    constructor() {
        this.db = null;
        this.certificateGenerator = null;
        this.init();
    }
    
    init() {
        if (typeof firebase !== 'undefined') {
            try {
                this.db = firebase.firestore();
                this.certificateGenerator = new CertificateGenerator();
            } catch (error) {
                this.showError('Failed to initialize certificate system. Please refresh the page.');
            }
        } else {
            this.showError('Firebase is not available. Please check your internet connection.');
        }
    }
    
    // Enhanced search for participant in Firestore with security
    async searchParticipant(collectionName, email) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        // Security: Input validation and sanitization
        if (!SecurityUtils.validateEmail(email)) {
            SecurityUtils.logSecurityEvent('invalid_email_input', { email, collectionName });
            throw new Error('Invalid email format');
        }
        
        // Security: Rate limiting
        const rateLimitKey = `search_${email}`;
        if (!SecurityUtils.checkRateLimit(rateLimitKey, 10, 60000)) {
            SecurityUtils.logSecurityEvent('rate_limit_exceeded', { email, collectionName });
            throw new Error('Too many search attempts. Please wait before trying again.');
        }
        
        // Security: Sanitize collection name
        const sanitizedCollection = SecurityUtils.sanitizeFirestoreQuery(collectionName);
        if (!sanitizedCollection) {
            SecurityUtils.logSecurityEvent('invalid_collection_name', { collectionName });
            throw new Error('Invalid collection name');
        }
        
        try {
            const querySnapshot = await this.db.collection(sanitizedCollection)
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();
            
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                const participantData = { id: doc.id, ...doc.data() };
                
                const sanitizedData = this.sanitizeParticipantData(participantData);
                return sanitizedData;
            }
            
            return null;
            
        } catch (error) {
            SecurityUtils.logSecurityEvent('search_error', { error: error.message, email, collectionName });
            
            // Provide more specific error messages
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else if (error.code === 'unavailable') {
                throw new Error('Service temporarily unavailable. Please try again later.');
            } else {
                throw new Error('Failed to search for participant. Please try again.');
            }
        }
    }
    
    // Security: Sanitize participant data
    sanitizeParticipantData(data) {
        if (!data || typeof data !== 'object') {
            return {};
        }
        
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                sanitized[key] = SecurityUtils.escapeHtml(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
    
    // Enhanced certificate generation
    async generateCertificate(eventSlug, participant, eventConfig) {
        try {

            const existingCertificate = await this.certificateGenerator.getExistingCertificate(eventSlug, participant.id);
            
            // Generate new certificate (always regenerate for fresh data)
            const certificate = await this.certificateGenerator.generateCertificate(eventSlug, participant, eventConfig);
            
            // Show success message
            this.showSuccess('Certificate generated successfully!');
            
            return certificate;
            
        } catch (error) {

            
            // Provide specific error messages
            if (error.message.includes('template')) {
                throw new Error('Failed to load certificate template. Please contact support.');
            } else if (error.message.includes('PDF')) {
                throw new Error('Failed to generate PDF. Please try again.');
            } else {
                throw new Error('Failed to generate certificate. Please try again.');
            }
        }
    }
    
    // Enhanced participant status update
    async updateParticipantStatus(participantId, collectionName) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        try {

            
            await this.db.collection(collectionName).doc(participantId).update({
                certificateDownloaded: true,
                downloadedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            

            this.showSuccess('Certificate download recorded successfully!');
            
        } catch (error) {

            
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else {
                throw new Error('Failed to update participant status. Please try again.');
            }
        }
    }
    
    // Enhanced event configuration retrieval
    async getEventConfig(eventSlug) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        try {

            
            const doc = await this.db.collection('events').doc(eventSlug).get();
            if (doc.exists) {
                const config = doc.data();
                return config;
            }
            
            return null;
            return null;
            
        } catch (error) {

            
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else {
                throw new Error('Failed to retrieve event configuration. Please try again.');
            }
        }
    }
    
    // Enhanced participant data upload
    async uploadParticipants(eventSlug, participants) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        try {

            
            const batch = this.db.batch();
            const collectionRef = this.db.collection(eventSlug + '_participants');
            
            participants.forEach(participant => {
                const docRef = collectionRef.doc();
                batch.set(docRef, {
                    ...participant,
                    email: participant.email.toLowerCase(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    certificateDownloaded: false,
                    downloadedAt: null,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();

            
            this.showSuccess(`Successfully uploaded ${participants.length} participants!`);
            return participants.length;
            
        } catch (error) {

            
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else if (error.code === 'resource-exhausted') {
                throw new Error('Upload limit exceeded. Please try with fewer participants.');
            } else {
                throw new Error('Failed to upload participants. Please try again.');
            }
        }
    }
    
    // Enhanced event statistics
    async getEventStats(eventSlug) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        try {

            
            const collectionRef = this.db.collection(eventSlug + '_participants');
            const snapshot = await collectionRef.get();
            
            const totalParticipants = snapshot.size;
            let downloadedCount = 0;
            let pendingCount = 0;
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.certificateDownloaded) {
                    downloadedCount++;
                } else {
                    pendingCount++;
                }
            });
            
            const stats = {
                totalParticipants,
                downloadedCount,
                pendingCount,
                downloadRate: totalParticipants > 0 ? (downloadedCount / totalParticipants * 100).toFixed(1) : 0
            };
            

            return stats;
            
        } catch (error) {

            
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else {
                throw new Error('Failed to retrieve event statistics. Please try again.');
            }
        }
    }
    
    // Enhanced recent downloads
    async getRecentDownloads(limit = 10) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        
        try {

            
            const snapshot = await this.db.collection('certificates')
                .orderBy('generatedAt', 'desc')
                .limit(limit)
                .get();
            
            const downloads = [];
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                try {
                    const participantDoc = await this.db.collection(data.eventSlug + '_participants')
                        .doc(data.participantId)
                        .get();
                    
                    if (participantDoc.exists) {
                        downloads.push({
                            ...data,
                            participant: participantDoc.data()
                        });
                    }
                } catch (participantError) {
                    // Continue with other downloads
                }
            }
            

            return downloads;
            
        } catch (error) {

            
            if (error.code === 'permission-denied') {
                throw new Error('Access denied. Please contact the administrator.');
            } else {
                throw new Error('Failed to retrieve recent downloads. Please try again.');
            }
        }
    }
    
    // Enhanced error handling and user feedback
    showError(message, duration = 5000) {
        Utils.showAlert(message, 'danger', duration);
    }
    
    showSuccess(message, duration = 3000) {
        Utils.showAlert(message, 'success', duration);
    }
    
    showWarning(message, duration = 4000) {
        Utils.showAlert(message, 'warning', duration);
    }
    
    showInfo(message, duration = 4000) {
        Utils.showAlert(message, 'info', duration);
    }
}

// Enhanced Utility Functions
class Utils {
    // Enhanced date formatting
    static formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        
        try {
            return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
        } catch (error) {
            return 'Invalid Date';
        }
    }
    
    // Enhanced date-time formatting
    static formatDateTime(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        try {
            return new Date(date).toLocaleString('en-US', { ...defaultOptions, ...options });
        } catch (error) {
            return 'Invalid Date';
        }
    }
    
    // Enhanced email validation
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }
    
    // Enhanced string sanitization
    static sanitizeString(str, maxLength = 1000) {
        if (!str || typeof str !== 'string') {
            return '';
        }
        
        // Remove potentially dangerous characters
        let sanitized = str.replace(/[<>]/g, '');
        
        // Limit length
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '...';
        }
        
        return sanitized.trim();
    }
    
    // Enhanced ID generation
    static generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 9);
        return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
    }
    
    // Enhanced loading state management
    static showLoading(element, loadingText = 'Loading...') {
        if (!element) return;
        
        // Store original content
        if (!element.dataset.originalContent) {
            element.dataset.originalContent = element.innerHTML;
        }
        
        element.disabled = true;
        element.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>${loadingText}`;
    }
    
    static hideLoading(element) {
        if (!element) return;
        
        element.disabled = false;
        
        // Restore original content
        if (element.dataset.originalContent) {
            element.innerHTML = element.dataset.originalContent;
            delete element.dataset.originalContent;
        }
    }
    
    // Enhanced alert system
    static showAlert(message, type = 'info', duration = 5000) {
        // Remove existing alerts of the same type
        const existingAlerts = document.querySelectorAll(`.alert-${type}`);
        existingAlerts.forEach(alert => alert.remove());
        
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
                <i class="fas fa-${iconMap[type] || 'info-circle'} me-2 mt-1"></i>
                <div class="flex-grow-1">
                    <div class="fw-semibold">${message}</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, duration);
        
        // Add click to dismiss functionality
        alertDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-close')) {
                alertDiv.remove();
            }
        });
    }
    
    // Enhanced confirmation dialog
    static confirmAction(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary confirm-btn">Confirm</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const modalInstance = new bootstrap.Modal(modal);
            
            // Handle confirm button
            const confirmBtn = modal.querySelector('.confirm-btn');
            confirmBtn.addEventListener('click', () => {
                modalInstance.hide();
                resolve(true);
            });
            
            // Handle modal hidden event
            modal.addEventListener('hidden.bs.modal', () => {
                resolve(false);
                modal.remove();
            });
            
            modalInstance.show();
        });
    }
    
    // Enhanced CSV parsing with better error handling
    static parseCSV(csvText, options = {}) {
        const defaultOptions = {
            skipEmptyLines: true,
            trimFields: true,
            maxRows: 10000
        };
        
        const opts = { ...defaultOptions, ...options };
        
        try {
            if (!csvText || typeof csvText !== 'string') {
                throw new Error('Invalid CSV text provided');
            }
            
            const lines = csvText.split(/\r?\n/);
            
            if (lines.length === 0) {
                return { headers: [], rows: [] };
            }
            
            // Parse headers
            const headers = lines[0].split(',').map(h => {
                let header = h.trim().replace(/"/g, '');
                if (opts.trimFields) {
                    header = header.trim();
                }
                return header;
            });
            
            if (headers.length === 0) {
                throw new Error('No headers found in CSV');
            }
            
            // Parse rows
            const rows = [];
            for (let i = 1; i < lines.length && rows.length < opts.maxRows; i++) {
                const line = lines[i].trim();
                
                if (opts.skipEmptyLines && !line) {
                    continue;
                }
                
                const values = line.split(',').map(v => {
                    let value = v.trim().replace(/"/g, '');
                    if (opts.trimFields) {
                        value = value.trim();
                    }
                    return value;
                });
                
                if (values.length > 0) {
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || '';
                    });
                    rows.push(row);
                }
            }
            
            return { headers, rows };
            
        } catch (error) {
            throw new Error(`Failed to parse CSV: ${error.message}`);
        }
    }
    
    // Enhanced file reading with progress
    static async readFileAsText(file, onProgress = null) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.onprogress = (e) => {
                if (onProgress && e.lengthComputable) {
                    const progress = (e.loaded / e.total) * 100;
                    onProgress(progress);
                }
            };
            
            reader.readAsText(file);
        });
    }
    
    // Enhanced debounce function
    static debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    }
    
    // Enhanced throttle function
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Enhanced local storage with error handling
    static setLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }
    
    static getLocalStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }
    
    // Enhanced session storage with error handling
    static setSessionStorage(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }
    
    static getSessionStorage(key, defaultValue = null) {
        try {
            const item = sessionStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }
}

// Global instances
let certificateManager;
let utils = Utils;

// Make utils available globally immediately
window.utils = utils;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        certificateManager = new CertificateManager();
        
        // Make available globally
        window.certificateManager = certificateManager;
        
    } catch (error) {
        Utils.showAlert('Failed to initialize application. Please refresh the page.', 'danger');
    }
});

// Global helper functions
window.showAlert = Utils.showAlert;
window.formatDate = Utils.formatDate;
window.formatDateTime = Utils.formatDateTime;
window.validateEmail = Utils.validateEmail;
window.parseCSV = Utils.parseCSV;
window.readFileAsText = Utils.readFileAsText;
window.confirmAction = Utils.confirmAction;
window.debounce = Utils.debounce;
window.throttle = Utils.throttle;

// Enhanced error handling for unhandled errors
window.addEventListener('error', function(event) {
    Utils.showAlert('An unexpected error occurred. Please refresh the page.', 'danger');
});

window.addEventListener('unhandledrejection', function(event) {
    Utils.showAlert('An unexpected error occurred. Please refresh the page.', 'danger');
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CertificateManager, Utils };
}
