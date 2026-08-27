// Version 7, Milestone 176: Supabase Storage helper for affiliate
// application verification documents (identity documents, proof of
// residence). A third, entirely separate private bucket — same
// discipline as digitalAssetStorage.service.ts's own header comment on
// why it stays a separate module/client from the public product-images
// helper: mixing "this is a purchased file only the paying customer may
// ever see" with "this is an applicant's ID document only they and an
// authorised admin may ever see" in one module would make it too easy
// for a future edit to blur very different sensitivity boundaries. This
// module never calls getPublicUrl() and never uploads to
// env.productImagesBucket/env.digitalProductsBucket — only
// createSignedUrl() against env.affiliateVerificationDocumentsBucket.
//
// The bucket itself (env.affiliateVerificationDocumentsBucket, default
// "affiliate-verification-documents") is never created by this backend
// — see backend/AFFILIATE_VERIFICATION_SETUP.md for the one-time manual
// Supabase dashboard step (create the bucket, leave "Public bucket"
// OFF).
//
// Never logs the service role key, a signed URL, or a raw storage path
// — only bucket/path-shaped identifiers that are already meant to be
// internal-only, and only ever in a thrown error's own safe message.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export class AffiliateDocumentStorageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "AffiliateDocumentStorageError";
    this.statusCode = statusCode;
  }
}

const NOT_CONFIGURED_MESSAGE = "Affiliate document storage is not configured.";

export function isAffiliateDocumentStorageConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

let client: SupabaseClient | undefined;

// Deliberately its own client instance, not shared with
// supabaseStorage.service.ts/digitalAssetStorage.service.ts — see this
// file's own header comment for why the three buckets must be able to
// change independently.
function getClient(): SupabaseClient {
  if (!isAffiliateDocumentStorageConfigured()) {
    throw new AffiliateDocumentStorageError(NOT_CONFIGURED_MESSAGE);
  }
  if (!client) {
    client = createClient(env.supabaseUrl as string, env.supabaseServiceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface UploadAffiliateDocumentInput {
  path: string;
  buffer: Buffer;
  contentType: string;
}

// Uploads one private object. Never asks for or returns a public URL —
// the object is only ever reachable again via
// createSignedAffiliateDocumentUrl() below, freshly authorised every
// time. `upsert: false` — every path this service is asked to write
// already includes a fresh random file id (affiliateDocument.service.ts),
// so a collision would mean a bug, not an expected overwrite; a genuine
// "replace this document" always uploads to a brand-new path and removes
// the old one afterward (brief section 40), never overwrites in place.
export async function uploadAffiliateDocument({ path, buffer, contentType }: UploadAffiliateDocumentInput): Promise<{ path: string }> {
  const supabase = getClient();

  const { error } = await supabase.storage.from(env.affiliateVerificationDocumentsBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new AffiliateDocumentStorageError(`Document upload failed: ${error.message}`, 502);
  }

  return { path };
}

// Short-lived signed URL — the only way this backend ever hands a
// document's real content to a browser (applicant viewing their own
// upload, or an authorised admin reviewing it). Deliberately shorter
// than digital downloads' own 5 minutes is not required here — 5
// minutes is already the established "short-lived" convention in this
// codebase and is reused as-is (brief section 14/35: "short-lived
// signed URLs where admin viewing is necessary"). Called fresh on every
// single request; nothing caches or reuses a signed URL across requests
// or viewers.
export async function createSignedAffiliateDocumentUrl(path: string, expiresInSeconds: number): Promise<string> {
  const supabase = getClient();

  const { data, error } = await supabase.storage.from(env.affiliateVerificationDocumentsBucket).createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new AffiliateDocumentStorageError("Could not generate a document access link right now. Please try again shortly.", 502);
  }

  return data.signedUrl;
}

// Best-effort cleanup only, same discipline as
// removeDigitalAssetObjectBestEffort() — used when a database write
// fails after a storage upload already succeeded, or after a document
// replacement's new object has already been safely committed to the
// database. Never throws: a cleanup failure must never mask the real
// error/response the caller already has; an occasional orphaned private
// object is unreachable without a signed URL this backend never
// generates for it again, so it poses no exposure risk.
export async function removeAffiliateDocumentObjectBestEffort(path: string): Promise<void> {
  if (!isAffiliateDocumentStorageConfigured()) return;
  try {
    const supabase = getClient();
    await supabase.storage.from(env.affiliateVerificationDocumentsBucket).remove([path]);
  } catch {
    // Swallowed deliberately — see comment above.
  }
}

// Same "mutable consumption object" seam as digitalAssetStorage's own
// export — necessary because a genuine ES module named-import binding
// is read-only from the importing side, confirmed empirically elsewhere
// in this codebase. Production code always gets these exact real
// implementations; only a test file that temporarily reassigns one
// property, then restores it afterward, ever sees anything different.
export const affiliateDocumentStorage = {
  isAffiliateDocumentStorageConfigured,
  uploadAffiliateDocument,
  createSignedAffiliateDocumentUrl,
  removeAffiliateDocumentObjectBestEffort,
};
