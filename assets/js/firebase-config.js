const firebaseConfig = {
    apiKey: "AIzaSyAESgXpnL3FJI_87YDuxq_cexaw0xGEgjo",
    authDomain: "rsacertificatecenter.firebaseapp.com",
    projectId: "rsacertificatecenter",
    storageBucket: "rsacertificatecenter.firebasestorage.app",
    messagingSenderId: "636003063381",
    appId: "1:636003063381:web:af3ced308e9fce17a4a6dc",
    measurementId: "G-9WNGCFTSQJ"
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

if (typeof firebase !== 'undefined') {
    try {
        validateFirebaseConfig(firebaseConfig);
        firebase.initializeApp(firebaseConfig);
        
        const auth = firebase.auth();
        const db = firebase.firestore();
        
        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
        }, { merge: true });
        
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
}

window.firebaseConfig = {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
};
