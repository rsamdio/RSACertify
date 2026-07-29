import * as functions from 'firebase-functions/v1';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();
const secretCache = new Map<string, string>();

function getProjectId(): string {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
        throw new functions.https.HttpsError('failed-precondition', 'Missing GCP project ID');
    }
    return projectId;
}

/**
 * Prefer env-injected secrets (firebase runWith({ secrets })) then Secret Manager API.
 */
export async function getSecretValue(secretName: string): Promise<string> {
    const normalizedSecretName = secretName.trim();
    if (!normalizedSecretName) {
        throw new functions.https.HttpsError('failed-precondition', 'Secret name is required');
    }

    const fromEnv = process.env[normalizedSecretName]?.trim();
    if (fromEnv) {
        return fromEnv;
    }

    const cached = secretCache.get(normalizedSecretName);
    if (cached) {
        return cached;
    }

    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${getProjectId()}/secrets/${normalizedSecretName}/versions/latest`
        });
        const value = version.payload?.data?.toString('utf8')?.trim();
        if (!value) {
            throw new Error(`Secret ${normalizedSecretName} is empty`);
        }
        secretCache.set(normalizedSecretName, value);
        return value;
    } catch (error) {
        console.error(`Unable to access secret ${normalizedSecretName}:`, error);
        throw new functions.https.HttpsError(
            'failed-precondition',
            `Secret ${normalizedSecretName} is not available`
        );
    }
}

export const REQUIRED_RUNTIME_SECRETS = [
    'DOWNLOAD_TOKEN_SECRET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY'
] as const;
