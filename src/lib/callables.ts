import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "@/lib/firebase-client";
import { toLookupKey } from "@/lib/security";

export type VerifyResponse = {
  found: boolean;
  participant?: {
    id: string;
    name: string;
    lookup: string;
    additionalFields?: Record<string, string>;
    templateKey?: string;
  };
  templateUrl?: string;
  downloadToken?: string;
};

export async function verifyCertificate(activitySlug: string, lookupRaw: string): Promise<VerifyResponse> {
  const fn = httpsCallable(getFirebaseServices().functions, "verifyCertificate");
  const lookup = toLookupKey(lookupRaw);
  const result = await fn({ activitySlug, lookup });
  return result.data as VerifyResponse;
}

export async function markCertificateDownloaded(input: {
  activitySlug: string;
  participantId: string;
  downloadToken: string;
}) {
  const fn = httpsCallable(getFirebaseServices().functions, "markCertificateDownloaded");
  await fn(input);
}

export async function getTemplateUploadUrl(input: {
  activitySlug: string;
  templateKey: string;
  contentType: string;
  contentLength: number;
}) {
  const fn = httpsCallable(getFirebaseServices().functions, "getTemplateUploadUrl");
  const result = await fn(input);
  return result.data as {
    uploadUrl: string;
    templateUrl: string;
    headers: Record<string, string>;
  };
}

export async function bulkUploadParticipants(input: {
  activitySlug: string;
  participants: Array<{
    name: string;
    lookup: string;
    templateKey?: string;
    additionalFields?: Record<string, string>;
  }>;
}) {
  const fn = httpsCallable(getFirebaseServices().functions, "bulkUploadParticipants");
  const result = await fn(input);
  return result.data as { success: boolean; processed: number; total: number; skipped?: number };
}

export type PendingInvite = {
  id: string;
  email: string;
  type: string;
  activitySlug?: string;
  createdAt?: number;
  expiresAt?: number;
};

export async function invitePlatformAdmin(email: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "invitePlatformAdmin");
  const result = await fn({ email });
  return result.data as { ok: boolean; inviteId: string; email: string; expiresAt: number };
}

export async function inviteActivityManager(email: string, activitySlug: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "inviteActivityManager");
  const result = await fn({ email, activitySlug });
  return result.data as {
    ok: boolean;
    inviteId: string;
    email: string;
    activitySlug: string;
    expiresAt: number;
  };
}

export async function listPlatformInvites() {
  const fn = httpsCallable(getFirebaseServices().functions, "listPlatformInvites");
  const result = await fn({});
  return result.data as { invites: PendingInvite[] };
}

export async function revokeInvite(inviteId: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "revokeInvite");
  await fn({ inviteId });
}

export async function getMyPendingInvites() {
  const fn = httpsCallable(getFirebaseServices().functions, "getMyPendingInvites");
  const result = await fn({});
  return result.data as { invites: PendingInvite[] };
}

export async function removePlatformAdmin(uid: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "removePlatformAdmin");
  await fn({ uid });
}

export async function removeActivityManager(uid: string, activitySlug: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "removeActivityManager");
  await fn({ uid, activitySlug });
}

export async function acceptInvite(inviteId: string) {
  const fn = httpsCallable(getFirebaseServices().functions, "acceptInvite");
  await fn({ inviteId });
}

export async function syncAdminClaims() {
  const { auth, functions } = getFirebaseServices();
  const fn = httpsCallable(functions, "syncAdminClaims");
  await fn({});
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
}
