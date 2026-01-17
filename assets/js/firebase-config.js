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

function validateFirebaseConfig(config) {
    const requiredFields = ['apiKey', 'authDomain', 'projectId'];
    for (const field of requiredFields) {
        if (!config[field]) {
            throw new Error(`Missing required Firebase config field: ${field}`);
        }
    }
    
    if (!config.authDomain.includes('.firebaseapp.com') && !config.authDomain.includes('.web.app')) {
        throw new Error('Invalid Firebase auth domain');
    }
    
    return true;
}

// Initialize Firebase when ready
function initializeFirebaseApp() {
    if (typeof firebase !== 'undefined') {
        try {
            validateFirebaseConfig(firebaseConfig);
            
            // Check if app is already initialized
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            
            const auth = firebase.auth();
            const db = firebase.firestore();
            
            // Initialize Realtime Database
            const realtimeDb = firebase.database();
            window.realtimeDb = realtimeDb;
            
    // Configure Firestore settings
    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
        merge: true
    });
    
    // Initialize Analytics (with IndexedDB check)
    let analytics = null;
    try {
        if (firebase.analytics && firebase.analytics.isSupported && firebase.analytics.isSupported()) {
            analytics = firebase.analytics();
            // Set analytics user properties
            analytics.setAnalyticsCollectionEnabled(true);
        } else {
            console.warn('Analytics not supported in this environment (IndexedDB unavailable)');
        }
    } catch (analyticsError) {
        console.warn('Analytics initialization failed:', analyticsError);
    }
    
    console.log('✅ Realtime Database initialized');
            
            // Set up auth state listener
            auth.onAuthStateChanged((user) => {
                if (user) {
                    db.enableNetwork();
                } else {
                    // Don't disable network for anonymous users - they still need to access Firestore
                    // db.disableNetwork();
                }
            });
            
        } catch (error) {
            throw error;
        }
    } else {
        setTimeout(initializeFirebaseApp, 100);
    }
}

// Start initialization
initializeFirebaseApp();

window.firebaseConfig = {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
};
