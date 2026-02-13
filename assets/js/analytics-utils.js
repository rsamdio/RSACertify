// Analytics Utilities for RSA Certify
class AnalyticsUtils {
    constructor() {
        this.analytics = null;
        this.isInitialized = false;
        this.init();
    }
    
    init() {
        if (typeof firebase !== 'undefined' && firebase.analytics) {
            try {
                this.analytics = firebase.analytics();
                this.isInitialized = true;
            } catch (error) {
                // Analytics initialization failed
            }
        }
    }
    
    // Check if analytics is available
    isAvailable() {
        return this.isInitialized && this.analytics;
    }
    
    // Log custom event
    logEvent(eventName, parameters = {}) {
        if (!this.isAvailable()) {
            return;
        }
        
        try {
            // Add timestamp and page info to all events
            const enhancedParameters = {
                ...parameters,
                timestamp: Date.now(),
                page_url: window.location.href,
                page_title: document.title,
                user_agent: navigator.userAgent
            };
            
            this.analytics.logEvent(eventName, enhancedParameters);
        } catch (error) {
            // Event logging failed
        }
    }
    
    // Set user properties
    setUserProperties(properties) {
        if (!this.isAvailable()) {
            return;
        }
        
        try {
            Object.keys(properties).forEach(key => {
                this.analytics.setUserProperties({ [key]: properties[key] });
            });
        } catch (error) {
            // User properties setting failed
        }
    }
    
    // Set user ID
    setUserId(userId) {
        if (!this.isAvailable()) {
            return;
        }
        
        try {
            this.analytics.setUserId(userId);
        } catch (error) {
            // User ID setting failed
        }
    }
    
    // Certificate-specific events
    logCertificateSearch(eventSlug, searchType, searchValue, success = false, errorMessage = null) {
        this.logEvent('certificate_search', {
            event_slug: eventSlug,
            search_type: searchType, // 'email' or 'redeem_code'
            search_value_length: searchValue ? searchValue.length : 0,
            search_success: success,
            error_message: errorMessage,
            event_category: 'certificate',
            event_action: 'search'
        });
    }
    
    logCertificateFound(eventSlug, participantName, searchType) {
        this.logEvent('certificate_found', {
            event_slug: eventSlug,
            participant_name_length: participantName ? participantName.length : 0,
            search_type: searchType,
            event_category: 'certificate',
            event_action: 'found'
        });
    }
    
    logCertificateDownload(eventSlug, participantName, participantId, downloadTime) {
        this.logEvent('certificate_download', {
            event_slug: eventSlug,
            participant_name_length: participantName ? participantName.length : 0,
            participant_id: participantId,
            download_time_ms: downloadTime,
            event_category: 'certificate',
            event_action: 'download'
        });
    }
    
    logCertificateGenerationError(eventSlug, errorType, errorMessage) {
        this.logEvent('certificate_generation_error', {
            event_slug: eventSlug,
            error_type: errorType,
            error_message: errorMessage,
            event_category: 'certificate',
            event_action: 'error'
        });
    }
    
    // Page navigation events
    logPageView(pageName, pageCategory = 'general') {
        this.logEvent('page_view', {
            page_name: pageName,
            page_category: pageCategory,
            event_category: 'navigation',
            event_action: 'view'
        });
    }
    
    logEventPageView(eventSlug, eventTitle) {
        this.logEvent('event_page_view', {
            event_slug: eventSlug,
            event_title: eventTitle,
            event_category: 'event',
            event_action: 'view'
        });
    }
    
    // User interaction events
    logButtonClick(buttonName, buttonLocation, additionalData = {}) {
        this.logEvent('button_click', {
            button_name: buttonName,
            button_location: buttonLocation,
            ...additionalData,
            event_category: 'interaction',
            event_action: 'click'
        });
    }
    
    logFormSubmission(formName, formLocation, success = false, errorMessage = null) {
        this.logEvent('form_submission', {
            form_name: formName,
            form_location: formLocation,
            submission_success: success,
            error_message: errorMessage,
            event_category: 'interaction',
            event_action: 'submit'
        });
    }
    
    // Search and filter events
    logSearchQuery(searchTerm, resultsCount, searchLocation) {
        this.logEvent('search_query', {
            search_term_length: searchTerm ? searchTerm.length : 0,
            results_count: resultsCount,
            search_location: searchLocation,
            event_category: 'search',
            event_action: 'query'
        });
    }
    
    logFilterApplied(filterType, filterValue, resultsCount) {
        this.logEvent('filter_applied', {
            filter_type: filterType,
            filter_value: filterValue,
            results_count: resultsCount,
            event_category: 'search',
            event_action: 'filter'
        });
    }
    
    // Performance events
    logPageLoadTime(pageName, loadTime) {
        this.logEvent('page_load_time', {
            page_name: pageName,
            load_time_ms: loadTime,
            event_category: 'performance',
            event_action: 'load'
        });
    }
    
    logCertificateGenerationTime(eventSlug, generationTime) {
        this.logEvent('certificate_generation_time', {
            event_slug: eventSlug,
            generation_time_ms: generationTime,
            event_category: 'performance',
            event_action: 'generate'
        });
    }
    
    // Error tracking
    logError(errorType, errorMessage, errorLocation, additionalData = {}) {
        this.logEvent('error_occurred', {
            error_type: errorType,
            error_message: errorMessage,
            error_location: errorLocation,
            ...additionalData,
            event_category: 'error',
            event_action: 'occurred'
        });
    }
    
    // Admin events
    logAdminLogin(adminEmail, loginMethod) {
        this.logEvent('admin_login', {
            admin_email_domain: adminEmail ? adminEmail.split('@')[1] : 'unknown',
            login_method: loginMethod,
            event_category: 'admin',
            event_action: 'login'
        });
    }
    
    logAdminAction(actionType, actionDetails = {}) {
        this.logEvent('admin_action', {
            action_type: actionType,
            ...actionDetails,
            event_category: 'admin',
            event_action: 'action'
        });
    }
    
    // User engagement events
    logUserEngagement(engagementType, engagementValue, additionalData = {}) {
        this.logEvent('user_engagement', {
            engagement_type: engagementType,
            engagement_value: engagementValue,
            ...additionalData,
            event_category: 'engagement',
            event_action: 'track'
        });
    }
    
    // Session tracking
    logSessionStart() {
        this.logEvent('session_start', {
            session_id: this.generateSessionId(),
            event_category: 'session',
            event_action: 'start'
        });
    }
    
    logSessionEnd(sessionDuration) {
        this.logEvent('session_end', {
            session_duration_ms: sessionDuration,
            event_category: 'session',
            event_action: 'end'
        });
    }
    
    // Utility methods
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Track time spent on page
    trackPageTime(pageName) {
        const startTime = Date.now();
        
        // Track when user leaves the page
        window.addEventListener('beforeunload', () => {
            const timeSpent = Date.now() - startTime;
            this.logEvent('page_time_spent', {
                page_name: pageName,
                time_spent_ms: timeSpent,
                event_category: 'engagement',
                event_action: 'time_spent'
            });
        });
    }
    
    // Track scroll depth
    trackScrollDepth(pageName) {
        let maxScrollDepth = 0;
        const scrollThresholds = [25, 50, 75, 90, 100];
        const loggedThresholds = new Set();
        
        const trackScroll = () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollDepth = Math.round((scrollTop / documentHeight) * 100);
            
            if (scrollDepth > maxScrollDepth) {
                maxScrollDepth = scrollDepth;
                
                // Log when reaching new thresholds
                scrollThresholds.forEach(threshold => {
                    if (scrollDepth >= threshold && !loggedThresholds.has(threshold)) {
                        loggedThresholds.add(threshold);
                        this.logEvent('scroll_depth', {
                            page_name: pageName,
                            scroll_depth_percent: threshold,
                            event_category: 'engagement',
                            event_action: 'scroll'
                        });
                    }
                });
            }
        };
        
        window.addEventListener('scroll', trackScroll, { passive: true });
    }
}

// Global analytics instance
let analyticsUtils;

// Initialize analytics when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        analyticsUtils = new AnalyticsUtils();
        window.analyticsUtils = analyticsUtils;
        
        // Track initial page view
        const pageName = document.title || window.location.pathname;
        analyticsUtils.logPageView(pageName);
        
        // Track page time and scroll depth
        analyticsUtils.trackPageTime(pageName);
        analyticsUtils.trackScrollDepth(pageName);
        
        // Track session start
        analyticsUtils.logSessionStart();
        
        } catch (error) {
            // Analytics initialization failed
        }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsUtils;
}
