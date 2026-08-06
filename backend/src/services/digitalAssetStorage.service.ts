// Version 7, Milestone 152: Supabase Storage helper for digital product
// files (PDFs, etc.) — the private-bucket counterpart to
// supabaseStorage.service.ts's public product-images helper. The two
// are deliberately separate files even though the client-creation code
// is nearly identical: mixing a "these URLs are always public, cache
// them freely" helper with a "these objects must never be reachable
// without a short-lived signed URL" one in the same module would make
// it far too easy for a future edit to blur that boundary. This module
// never calls getPublicUrl() and never uploads to env.productImagesBucket
// — only createSignedUrl() against env.digitalProductsBucket.
//
// The bucket itself (env.digitalProductsBucket, default "digital-products")
// is never created by this backend — see this file's own
// isDigitalAssetStorageConfigured() caller sites and
// backend/DIGITAL_DOWNLOADS_SETUP.md for the one-time manual Supabase
// dashboard step (create the bucket, leave "Public bucket" OFF).
//
// Never logs the service role key, a signed URL, or a raw storage path
// — only bucket/path-shaped identifiers that are already meant to be
// internal-only, and only ever in a thrown error's own safe message.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export class DigitalAssetStorageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "DigitalAssetStorageError";
    this.statusCode = statusCode;
  }
}

const NOT_CONFIGURED_MESSAGE = "Digital product file storage is not configured.";

export function isDigitalAssetStorageConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

let client: SupabaseClient | undefined;

// Deliberately a second client instance, not a shared import from
// supabaseStorage.service.ts — the two modules must be able to change
// independently (e.g. a future rotation of one bucket's access pattern)
// without any risk of one accidentally affecting the other's client
// configuration. The actual credentials are identical today (same
// Supabase project), so this costs nothing but a second lazy
// createClient() call the first time either module is used.
function getClient(): SupabaseClient {
  if (!isDigitalAssetStorageConfigured()) {
    throw new DigitalAssetStorageError(NOT_CONFIGURED_MESSAGE);
  }
  if (!client) {
    client = createClient(env.supabaseUrl as string, env.supabaseServiceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface UploadDigitalAssetInput {
  path: string;
  buffer: Buffer;
  contentType: string;
}

// Uploads one private object. Unlike uploadProductImage(), this never
// asks for or returns a public URL — the object is only ever reachable
// again via createSignedDownloadUrl() below, each time freshly
// authorized. `upsert: false` for the same reason as product images:
// every path this service is asked to write already includes a
// timestamp (adminDigitalAsset.service.ts), so a collision would mean a
// bug, not an expected overwrite — a genuine "replace this file" always
// uploads to a brand-new path and deletes the old one afterward, never
// overwrites in place.
export async function uploadDigitalAsset({ path, buffer, contentType }: UploadDigitalAssetInput): Promise<{ path: string }> {
  const supabase = getClient();

  const { error } = await supabase.storage.from(env.digitalProductsBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new DigitalAssetStorageError(`Digital file upload failed: ${error.message}`, 502);
  }

  return { path };
}

// Short-lived signed URL — the only way this backend ever hands a
// digital file's real content to a browser. `expiresInSeconds` is
// deliberately short (see digitalDownload.service.ts's own constant)
// and this is called fresh on every single download request; nothing
// caches or reuses a signed URL across requests or customers.
export async function createSignedDownloadUrl(path: string, expiresInSeconds: number): Promise<string> {
  const supabase = getClient();

  const { data, error } = await supabase.storage.from(env.digitalProductsBucket).createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new DigitalAssetStorageError("Could not generate a download link right now. Please try again shortly.", 502);
  }

  return data.signedUrl;
}

// Best-effort cleanup only, same discipline as
// removeProductImageObjectBestEffort() — used when a database write
// fails after a storage upload already succeeded, or when an admin
// replaces/removes a digital file. Never throws: a cleanup failure must
// never mask the real error/response the caller already has, and an
// occasional orphaned private object is a low-risk tradeoff (it's
// unreachable without a signed URL this backend never generates for it
// again, so it poses no exposure risk — just a small amount of unused
// storage).
export async function removeDigitalAssetObjectBestEffort(path: string): Promise<void> {
  if (!isDigitalAssetStorageConfigured()) return;
  try {
    const supabase = getClient();
    await supabase.storage.from(env.digitalProductsBucket).remove([path]);
  } catch {
    // Swallowed deliberately — see comment above.
  }
}

// Version 7, Milestone 171A.1: a plain object grouping this module's
// four functions above — the smallest seam that lets a test mock real
// storage behaviour. Consumers (digitalDownload.service.ts,
// adminDigitalAsset.service.ts) import this object and call e.g.
// digitalAssetStorage.createSignedDownloadUrl(...) instead of a direct
// named import. This is necessary specifically because a genuine ES
// module named-import binding is read-only from the importing side —
// confirmed empirically (`Cannot assign to read only property` when a
// test tried it directly) — while a plain object's own properties
// stay fully mutable regardless of which module holds the reference.
// Production code always gets these exact real implementations
// (nothing here changes runtime behaviour); only a test file that
// temporarily reassigns one property on this object, then restores it
// afterward, ever sees anything different. The individual named
// exports above are unchanged and still the canonical implementations
// — this object is purely a consumption seam, not a second copy.
export const digitalAssetStorage = {
  isDigitalAssetStorageConfigured,
  uploadDigitalAsset,
  createSignedDownloadUrl,
  removeDigitalAssetObjectBestEffort,
};
