/**
 * Lazy Firebase Admin init to avoid discovery timeout and high memory during deploy.
 * firebase-admin is required only when the first function runs, not at module load.
 */
type Admin = typeof import('firebase-admin');

let _admin: Admin | null = null;

export function ensureAdmin(): void {
    if (_admin === null) {
        _admin = require('firebase-admin') as Admin;
    }
    
    // Check if default app exists, initialize if not
    try {
        // Try to get the default app - this will throw if it doesn't exist
        _admin.app();
    } catch (error) {
        // Default app doesn't exist, initialize it
        // Uses Application Default Credentials (ADC) in Cloud Functions
        _admin.initializeApp({
            databaseURL: 'https://rsacertify-default-rtdb.asia-southeast1.firebasedatabase.app'
        });
    }
}

export function getAdmin(): Admin {
    ensureAdmin();
    return _admin!;
}

/** Firestore FieldValue (increment, serverTimestamp) for use in writes. */
export function getFieldValue(): { increment(n: number): unknown; serverTimestamp(): unknown } {
    ensureAdmin();
    // FieldValue is a static property on the firestore namespace
    // Access it directly from the admin module, not from an instance
    const admin = _admin!;
    return admin.firestore.FieldValue;
}
