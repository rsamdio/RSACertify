/**
 * Lazy Firebase Admin init to avoid discovery timeout and high memory during deploy.
 * firebase-admin is required only when the first function runs, not at module load.
 */
type Admin = typeof import('firebase-admin');

let _admin: Admin | null = null;

export function ensureAdmin(): void {
    if (_admin === null) {
        _admin = require('firebase-admin') as Admin;
        if (!_admin.apps.length) {
            _admin.initializeApp();
        }
    }
}

export function getAdmin(): Admin {
    ensureAdmin();
    return _admin!;
}

/** Firestore FieldValue (increment, serverTimestamp) for use in writes. */
export function getFieldValue(): { increment(n: number): unknown; serverTimestamp(): unknown } {
    ensureAdmin();
    return (getAdmin() as any).firestore.FieldValue;
}
