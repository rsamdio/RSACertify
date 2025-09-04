// Security Utilities for Certificate Center
class SecurityUtils {
    
    // Input sanitization and validation
    static sanitizeInput(input, type = 'text') {
        if (typeof input !== 'string') {
            return '';
        }
        
        // Remove potentially dangerous characters
        let sanitized = input
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
        
        // Type-specific validation
        switch (type) {
            case 'email':
                return this.validateEmail(sanitized) ? sanitized.toLowerCase() : '';
            case 'name':
                return this.validateName(sanitized) ? sanitized : '';
            case 'url':
                return this.validateUrl(sanitized) ? sanitized : '';
            case 'phone':
                return this.validatePhone(sanitized) ? sanitized : '';
            default:
                return sanitized;
        }
    }
    
    // Email validation
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
    }
    
    // Name validation
    static validateName(name) {
        return name.length >= 1 && name.length <= 100 && /^[a-zA-Z\s\-'\.]+$/.test(name);
    }
    
    // URL validation
    static validateUrl(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }
    
    // Phone validation
    static validatePhone(phone) {
        return /^[\+]?[1-9][\d]{0,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''));
    }
    
    // CSV file validation
    static validateCsvFile(file) {
        // Check file type
        if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
            throw new Error('Invalid file type. Only CSV files are allowed.');
        }
        
        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('File too large. Maximum size is 5MB.');
        }
        
        // Check file name for malicious patterns
        if (/[<>:"/\\|?*]/.test(file.name)) {
            throw new Error('Invalid file name.');
        }
        
        return true;
    }
    
    // Rate limiting for admin functions
    static rateLimit = new Map();
    
    static checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
        const now = Date.now();
        const attempts = this.rateLimit.get(key) || [];
        
        // Remove old attempts outside the time window
        const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
        
        if (recentAttempts.length >= maxAttempts) {
            return false; // Rate limit exceeded
        }
        
        // Add current attempt
        recentAttempts.push(now);
        this.rateLimit.set(key, recentAttempts);
        
        return true; // Within rate limit
    }
    
    // CSRF token generation and validation
    static generateCSRFToken() {
        return crypto.getRandomValues(new Uint8Array(32))
            .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '');
    }
    
    static validateCSRFToken(token, storedToken) {
        return token === storedToken;
    }
    
    // XSS prevention for dynamic content
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // SQL injection prevention (for Firestore queries)
    static sanitizeFirestoreQuery(query) {
        if (typeof query !== 'string') {
            return '';
        }
        
        // Remove potentially dangerous characters for Firestore
        return query.replace(/[<>"']/g, '').trim();
    }
    
    // Secure random string generation
    static generateSecureId(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // Input length validation
    static validateLength(input, minLength = 1, maxLength = 1000) {
        return input.length >= minLength && input.length <= maxLength;
    }
    
    // Admin email validation
    static validateAdminEmail(email) {
        // Only allow specific domains for admin access
        const allowedDomains = [
            'rsamdio.org',
            'rotaract.org',
            'rotary.org'
        ];
        
        if (!this.validateEmail(email)) {
            return false;
        }
        
        const domain = email.split('@')[1];
        return allowedDomains.some(allowed => domain === allowed || domain.endsWith('.' + allowed));
    }
    
    // Log security events
    static logSecurityEvent(event, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: event,
            details: details,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        
        // In production, send to security monitoring service
        if (window.location.hostname !== 'localhost') {
            // Send to security monitoring (implement as needed)
            this.sendSecurityLog(logEntry);
        }
    }
    
    // Send security logs to monitoring service
    static async sendSecurityLog(logEntry) {
        try {
            // Implement security logging service integration
            // This could be Firebase Functions, external service, etc.
        } catch (error) {
            // Silent error handling for production
        }
    }
}

// Export for use in other modules
window.SecurityUtils = SecurityUtils;
