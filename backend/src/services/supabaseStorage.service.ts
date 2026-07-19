// Version 7, Milestone 69: minimal Supabase Storage helper for product
// image uploads. Deliberately small — a single upload function plus a
// readiness check — not a general-purpose storage wrapper.
//
// The client is created lazily (only on first real use, not at import
// time) so a backend with SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY unset
// still starts and serves every other route normally; only the
// image-upload routes are affected. Never logs the service role key —
// only its presence/absence (see config/env.ts).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export class ProductImageStorageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "ProductImageStorageError";
    this.statusCode = statusCode;
  }
}

const NOT_CONFIGURED_MESSAGE = "Product image upload is not configured.";

export function isProductImageUploadConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!isProductImageUploadConfigured()) {
    throw new ProductImageStorageError(NOT_CONFIGURED_MESSAGE);
  }
  if (!client) {
    // Server-role key, server-only client — never constructed in, or
    // shipped to, the frontend. `persistSession`/`autoRefreshToken` are
    // both irrelevant for a service-role backend client and are turned
    // off to avoid any accidental token-refresh background behaviour.
    client = createClient(env.supabaseUrl as string, env.supabaseServiceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface UploadProductImageInput {
  path: string;
  buffer: Buffer;
  contentType: string;
}

export interface UploadProductImageResult {
  publicUrl: string;
  path: string;
}

// Uploads one object and returns its public URL. Throws
// ProductImageStorageError (never a raw Supabase error) so callers can
// turn it into a clean, safe API response without leaking storage
// internals. `upsert: false` — every path this service generates
// already includes a timestamp (adminProductImage.service.ts), so a
// collision here would indicate a bug, not an expected overwrite.
export async function uploadProductImage({
  path,
  buffer,
  contentType,
}: UploadProductImageInput): Promise<UploadProductImageResult> {
  const supabase = getClient();

  const { error: uploadError } = await supabase.storage.from(env.productImagesBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    throw new ProductImageStorageError(`Image upload failed: ${uploadError.message}`, 502);
  }

  const { data } = supabase.storage.from(env.productImagesBucket).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new ProductImageStorageError("Image upload succeeded but no public URL was returned.", 502);
  }

  return { publicUrl: data.publicUrl, path };
}

// Best-effort cleanup only, used when a database write fails after a
// storage upload already succeeded (adminProductImage.service.ts).
// Deliberately never throws — a cleanup failure must never mask the
// real error the caller already has, and per
// VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md Section 10, an occasional
// leftover unused object is an acceptable tradeoff for a simple first
// version rather than a hard failure here.
export async function removeProductImageObjectBestEffort(path: string): Promise<void> {
  if (!isProductImageUploadConfigured()) return;
  try {
    const supabase = getClient();
    await supabase.storage.from(env.productImagesBucket).remove([path]);
  } catch {
    // Swallowed deliberately — see comment above.
  }
}
