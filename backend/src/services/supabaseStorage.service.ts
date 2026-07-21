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
// storage upload already succeeded (adminProductImage.service.ts), or
// after an admin-initiated image removal (Version 7, Milestone 74)
// has already deleted the ProductImage row. Deliberately never throws
// — a cleanup failure must never mask the real error/response the
// caller already has, and per VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md
// Section 10, an occasional leftover unused object is an acceptable
// tradeoff for a simple version rather than a hard failure here.
export async function removeProductImageObjectBestEffort(path: string): Promise<void> {
  if (!isProductImageUploadConfigured()) return;
  try {
    const supabase = getClient();
    await supabase.storage.from(env.productImagesBucket).remove([path]);
  } catch {
    // Swallowed deliberately — see comment above.
  }
}

// Version 7, Milestone 74: a ProductImage.url is either a Supabase
// public object URL (uploaded via this backend) or a root-relative
// static frontend asset path (e.g. "/images/product-1.jpg", the
// original 10 products' current placeholder images). Only the former
// has a real Storage object behind it to ever consider deleting — a
// static path is a file bundled into the frontend's own build, never
// something this backend can or should touch.
export function isSupabaseStorageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && url.includes("/storage/v1/object/public/");
}

// Recovers the bucket-relative object path (e.g.
// "products/{id}/main/{timestamp}-{name}.jpg") from a full public URL
// previously returned by uploadProductImage's getPublicUrl call.
// Returns null if the URL doesn't match this bucket's own public URL
// shape at all — callers must treat that as "nothing safe to delete",
// never guess or fall back to deleting something else.
export function extractStoragePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${env.productImagesBucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}
