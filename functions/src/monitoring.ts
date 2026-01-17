// Monitoring utilities - no imports needed for basic monitoring

/**
 * Performance monitoring wrapper for Cloud Functions
 */
export function withMonitoring<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    functionName: string
): T {
    return (async (...args: any[]) => {
        try {
            const result = await fn(...args);
            return result;
        } catch (error) {
            console.error(`[${functionName}] Error:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString()
            });
            
            throw error;
        }
    }) as T;
}

/**
 * Report error to monitoring service
 * This can be extended to integrate with error reporting services
 */
export function reportError(functionName: string, error: any): void {
    // Error reporting can be extended to integrate with Firebase Error Reporting, Sentry, etc.
}

/**
 * Track custom metrics
 */
export async function trackMetric(
    metricName: string,
    value: number,
    tags?: Record<string, string>
): Promise<void> {
    // Metrics can be stored in Firestore or sent to monitoring services
}

