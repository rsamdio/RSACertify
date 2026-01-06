// Monitoring utilities - no imports needed for basic monitoring

/**
 * Performance monitoring wrapper for Cloud Functions
 */
export function withMonitoring<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    functionName: string
): T {
    return (async (...args: any[]) => {
        const startTime = Date.now();
        let success = false;
        
        try {
            const result = await fn(...args);
            success = true;
            return result;
        } catch (error) {
            // Log error details
            console.error(`[${functionName}] Error:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString()
            });
            
            // You can add error reporting service here (e.g., Sentry, Error Reporting)
            // Example: reportError(functionName, error);
            
            throw error;
        } finally {
            const executionTime = Date.now() - startTime;
            
            // Log performance metrics
            console.log(`[${functionName}] Performance:`, {
                executionTime: `${executionTime}ms`,
                success,
                timestamp: new Date().toISOString()
            });
            
            // Log to Firestore for analytics (optional)
            // Uncomment if you want to track function performance in Firestore
            /*
            try {
                await admin.firestore()
                    .collection('functionMetrics')
                    .add({
                        functionName,
                        executionTime,
                        success,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
            } catch (metricsError) {
                // Don't fail the function if metrics logging fails
                console.warn('Failed to log metrics:', metricsError);
            }
            */
        }
    }) as T;
}

/**
 * Report error to monitoring service
 * This can be extended to integrate with error reporting services
 */
export function reportError(functionName: string, error: any): void {
    // Example integration with Firebase Error Reporting
    // You can extend this to use other services like Sentry, etc.
    console.error(`[Error Reporting] ${functionName}:`, {
        error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error,
        timestamp: new Date().toISOString()
    });
}

/**
 * Track custom metrics
 */
export async function trackMetric(
    metricName: string,
    value: number,
    tags?: Record<string, string>
): Promise<void> {
    try {
        // Log metric
        console.log(`[Metric] ${metricName}:`, {
            value,
            tags,
            timestamp: new Date().toISOString()
        });
        
        // Optionally store in Firestore for analytics
        /*
        await admin.firestore()
            .collection('metrics')
            .add({
                name: metricName,
                value,
                tags: tags || {},
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        */
    } catch (error) {
        console.warn('Failed to track metric:', error);
    }
}

