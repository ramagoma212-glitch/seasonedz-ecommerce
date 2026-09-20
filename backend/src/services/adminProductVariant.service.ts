// Milestone 188: Admin Managed Product Variations — the write path for
// ProductVariant rows. Deliberately a separate file from
// adminProduct.service.ts (which owns the Product row itself, including
// hasVariants/variantOptions — the option-group *definitions*). This
// file owns the purchasable rows that combine those option values with
// a price/stock/sku/weight/image/active-status, per the brief's
// Product-vs-Variant responsibility split.
//
// Reuses adminProduct.service.ts's exported field-validation helpers
// (requirePositiveNumber etc.) so a variant's price/stock/sku fields
// are validated by the exact same rules as a simple product's, rather
// than a second, potentially-drifting copy.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  AdminProductError,
  getProductForAdmin,
  optionalTrimmedString,
  requirePositiveNumber,
  optionalPositiveNumber,
  requiredNonNegativeInteger,
  type AdminProductDetail,
  type VariantOptionGroup,
} from "./adminProduct.service.js";
import { validateAndNormalizeIsbn, validateAndNormalizeGtin, ProductIdentifierError } from "../utils/productIdentifiers.js";
import { lookupSouthAfricanLanguageCode } from "../utils/southAfricanLanguages.js";

const MAX_SHORT_TEXT_LENGTH = 200;
const MAX_IMAGE_URL_LENGTH = 2000;

// Milestone 188A: languageCode is never an admin-typed input — it's
// auto-derived, once, at variant CREATION time (createVariant() or
// generateVariations() below) from the "Language" entry of that
// variant's own optionValues, the same way this file already treats
// optionValues as fixed-at-creation. A custom/unrecognised language
// value (or a variant with no "Language" option group at all — e.g. a
// "Pack Size" variant) simply gets languageCode: null — this never
// blocks or forces anything (Part B: language metadata is optional).
function deriveLanguageCode(optionValues: Record<string, string>): string | null {
  const languageValue = optionValues["Language"];
  return typeof languageValue === "string" ? lookupSouthAfricanLanguageCode(languageValue) : null;
}

// Milestone 188A, Part F/G: optional isbn/gtin — validated + normalised
// to digits-only via utils/productIdentifiers.ts (never trusted or
// stored as raw, possibly-hyphenated input). Uniqueness itself is
// enforced by the database's own unique index on each column (unlike
// sku's cross-table problem, isbn/gtin are single-table constraints —
// no manual pre-check needed; the P2002 the database throws on a
// genuine collision is caught and turned into a clean message by the
// controller, same idiom as every other unique-field conflict in this
// codebase).
function parseOptionalIsbn(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new AdminProductError("isbn must be a string.");
  try {
    return validateAndNormalizeIsbn(raw);
  } catch (error) {
    if (error instanceof ProductIdentifierError) throw new AdminProductError(error.message);
    throw error;
  }
}

function parseOptionalGtin(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new AdminProductError("gtin must be a string.");
  try {
    return validateAndNormalizeGtin(raw);
  } catch (error) {
    if (error instanceof ProductIdentifierError) throw new AdminProductError(error.message);
    throw error;
  }
}

// Milestone 188, Part B: canonicalises one variant's optionValues into
// a stable string key, independent of key order — used both to detect
// which option combinations already have a variant row (Generate
// Variations must never create a duplicate or touch an existing row's
// price/stock) and to compare two option-value sets for equality.
function optionValuesKey(optionValues: Record<string, string>): string {
  return Object.keys(optionValues)
    .sort()
    .map((key) => `${key}=${optionValues[key]}`)
    .join("|");
}

// Every value in a variant's optionValues must name one of the
// product's own defined option groups and be one of that group's own
// defined values — never trusted as arbitrary JSON, matching this
// project's "server is the sole authority" discipline. Also requires
// EVERY group to be represented (a variant that only sets "Pack Size"
// on a product with two option groups is not a complete, purchasable
// combination).
function validateOptionValuesAgainstGroups(
  optionValues: Record<string, string>,
  groups: VariantOptionGroup[]
): void {
  const groupNames = new Set(groups.map((g) => g.name));
  for (const key of Object.keys(optionValues)) {
    if (!groupNames.has(key)) {
      throw new AdminProductError(`optionValues has an unknown option group: "${key}".`);
    }
  }
  for (const group of groups) {
    const value = optionValues[group.name];
    if (typeof value !== "string" || !group.values.includes(value)) {
      throw new AdminProductError(`optionValues is missing a valid value for option group "${group.name}".`);
    }
  }
}

async function assertSkuAvailable(sku: string, excludeVariantId?: string): Promise<void> {
  const existingProductSku = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existingProductSku) {
    throw new AdminProductError(`SKU already in use: ${sku}`, 409);
  }
  const existingVariantSku = await prisma.productVariant.findFirst({
    where: excludeVariantId ? { sku, NOT: { id: excludeVariantId } } : { sku },
    select: { id: true },
  });
  if (existingVariantSku) {
    throw new AdminProductError(`SKU already in use: ${sku}`, 409);
  }
}

async function loadVariableProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      price: true,
      hasVariants: true,
      variantOptions: true,
      // Milestone 188A, Part I: only ever read for the "prefill the
      // English variant from the existing product" convenience in
      // generateVariations() below — never written back to Product.
      stockQuantity: true,
      images: { where: { isPrimary: true }, take: 1, select: { url: true } },
    },
  });
  if (!product) {
    throw new AdminProductError(`Product not found: ${productId}`, 404);
  }
  if (!product.hasVariants) {
    throw new AdminProductError("This product does not have variations enabled.");
  }
  const groups = (product.variantOptions as unknown as VariantOptionGroup[] | null) ?? [];
  if (groups.length === 0) {
    throw new AdminProductError("This product has no option groups defined yet.");
  }
  return { ...product, groups };
}

// ---------------------------------------------------------------------------
// Generate Variations (Part G): creates one ProductVariant row for every
// option-value combination that doesn't already have one. Existing rows
// (their price/stock/sku/weight/image/active-status) are never touched
// — this only ever ADDS missing combinations, so it's always safe to
// re-run after adding a new option value.
// ---------------------------------------------------------------------------

export interface GenerateVariationsInput {
  defaultPrice?: unknown;
  defaultStockQuantity?: unknown;
}

export async function generateVariations(productId: string, rawInput: unknown): Promise<{ created: number; product: AdminProductDetail }> {
  const sourceProduct = await loadVariableProduct(productId);
  const { groups } = sourceProduct;

  const input = (typeof rawInput === "object" && rawInput !== null ? rawInput : {}) as GenerateVariationsInput;
  const defaultPrice = optionalPositiveNumber(input.defaultPrice, "defaultPrice");
  const defaultStockQuantity = input.defaultStockQuantity === undefined ? 0 : requiredNonNegativeInteger(input.defaultStockQuantity, "defaultStockQuantity");

  // Cartesian product of every group's values, e.g. two groups of 3 and
  // 2 values each produces 6 combinations. Bounded by the same
  // MAX_VARIANT_OPTION_GROUPS/VALUES ceilings enforced when
  // variantOptions was saved, so this can never explode unboundedly.
  let combinations: Record<string, string>[] = [{}];
  for (const group of groups) {
    const next: Record<string, string>[] = [];
    for (const partial of combinations) {
      for (const value of group.values) {
        next.push({ ...partial, [group.name]: value });
      }
    }
    combinations = next;
  }

  const existingVariants = await prisma.productVariant.findMany({
    where: { productId },
    select: { optionValues: true, sortOrder: true },
  });
  const existingKeys = new Set(
    existingVariants.map((v) => optionValuesKey(v.optionValues as unknown as Record<string, string>))
  );
  let nextSortOrder = existingVariants.reduce((max, v) => Math.max(max, v.sortOrder), -1) + 1;

  const missing = combinations.filter((combo) => !existingKeys.has(optionValuesKey(combo)));

  // Milestone 188A, Part I: the very first time variants are ever
  // generated for this product (no existing rows at all — meaning it
  // was, until now, a simple product), the ONE combination whose
  // Language is exactly "English" is prefilled from the product's own
  // current price/stock/sku/cover image, rather than the generic
  // defaultPrice/defaultStockQuantity every other combination gets.
  // Only applied when there is EXACTLY one such combination — a
  // product with a second option group (e.g. Language + Format) would
  // otherwise generate several "English" combinations that could never
  // all share the same globally-unique sku, so the safer, correct
  // choice there is to fall back to the generic defaults for every
  // combination and let the admin fill in each row's real values
  // afterward. Never applies to a re-run after variants already exist
  // (adding a new language later must never silently touch old data),
  // and never invents an ISBN/weight — Product has never had either
  // field, so there is genuinely nothing to prefill there (see this
  // milestone's own audit).
  const isFirstGeneration = existingVariants.length === 0;
  const englishCombos = isFirstGeneration ? missing.filter((combo) => combo["Language"] === "English") : [];
  const soleEnglishCombo = englishCombos.length === 1 ? englishCombos[0] : null;
  const parentImageUrl = sourceProduct.images[0]?.url ?? null;

  if (missing.length > 0) {
    await prisma.$transaction(
      missing.map((combo) => {
        const isEnglishFirstEdition = combo === soleEnglishCombo;
        return prisma.productVariant.create({
          data: {
            productId,
            optionValues: combo as unknown as Prisma.InputJsonValue,
            price: isEnglishFirstEdition ? sourceProduct.price : new Prisma.Decimal(defaultPrice ?? 0),
            stockQuantity: isEnglishFirstEdition ? sourceProduct.stockQuantity : defaultStockQuantity,
            sku: isEnglishFirstEdition ? sourceProduct.sku : null,
            imageUrl: isEnglishFirstEdition ? parentImageUrl : null,
            languageCode: deriveLanguageCode(combo),
            isActive: true,
            sortOrder: nextSortOrder++,
          },
        });
      })
    );
  }

  const product = await getProductForAdmin(productId);
  if (!product) throw new AdminProductError(`Product not found: ${productId}`, 404);
  return { created: missing.length, product };
}

// ---------------------------------------------------------------------------
// Create one specific variant manually — for the case a combinatorial
// Generate Variations pass doesn't cover (e.g. only some combinations
// should exist, such as a colour that isn't offered in every size).
// Most admin usage is expected to go through generateVariations above;
// this covers the exception.
// ---------------------------------------------------------------------------

export interface CreateVariantInput {
  optionValues?: unknown;
  price?: unknown;
  stockQuantity?: unknown;
  sku?: unknown;
  weight?: unknown;
  imageUrl?: unknown;
  isActive?: unknown;
  isbn?: unknown;
  gtin?: unknown;
}

export async function createVariant(productId: string, rawInput: unknown): Promise<AdminProductDetail> {
  const { groups } = await loadVariableProduct(productId);

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminProductError("Request body must be an object.");
  }
  const input = rawInput as CreateVariantInput;

  if (typeof input.optionValues !== "object" || input.optionValues === null || Array.isArray(input.optionValues)) {
    throw new AdminProductError("optionValues is required and must be an object mapping each option group name to a chosen value.");
  }
  const optionValues = input.optionValues as Record<string, string>;
  validateOptionValuesAgainstGroups(optionValues, groups);

  const price = requirePositiveNumber(input.price, "price");
  const stockQuantity = input.stockQuantity === undefined ? 0 : requiredNonNegativeInteger(input.stockQuantity, "stockQuantity");
  const weight = optionalPositiveNumber(input.weight, "weight");
  const imageUrl = optionalTrimmedString(input.imageUrl, "imageUrl", MAX_IMAGE_URL_LENGTH);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);
  const sku = optionalTrimmedString(input.sku, "sku", MAX_SHORT_TEXT_LENGTH);
  if (sku) {
    await assertSkuAvailable(sku);
  }
  const isbn = parseOptionalIsbn(input.isbn);
  const gtin = parseOptionalGtin(input.gtin);

  const existingVariants = await prisma.productVariant.findMany({ where: { productId }, select: { optionValues: true, sortOrder: true } });
  const key = optionValuesKey(optionValues);
  const alreadyExists = existingVariants.some((v) => optionValuesKey(v.optionValues as unknown as Record<string, string>) === key);
  if (alreadyExists) {
    throw new AdminProductError("A variant with this exact combination of option values already exists.", 409);
  }
  const sortOrder = existingVariants.reduce((max, v) => Math.max(max, v.sortOrder), -1) + 1;

  await prisma.productVariant.create({
    data: {
      productId,
      optionValues: optionValues as unknown as Prisma.InputJsonValue,
      price,
      stockQuantity,
      sku,
      weight,
      imageUrl,
      isActive,
      sortOrder,
      isbn,
      gtin,
      languageCode: deriveLanguageCode(optionValues),
    },
  });

  const product = await getProductForAdmin(productId);
  if (!product) throw new AdminProductError(`Product not found: ${productId}`, 404);
  return product;
}

// ---------------------------------------------------------------------------
// Update one variant's own fields. Never touches optionValues — which
// combination a variant represents is fixed at creation (via Generate
// Variations); reassigning it after the fact would silently rewrite
// which combination past orders' immutable snapshots are conceptually
// tied to. To change the option combinations offered, edit the
// product's variantOptions and re-run Generate Variations instead.
// ---------------------------------------------------------------------------

const ALLOWED_VARIANT_UPDATE_FIELDS = ["price", "stockQuantity", "sku", "weight", "imageUrl", "isActive", "sortOrder", "isbn", "gtin"] as const;

export async function updateVariant(productId: string, variantId: string, rawInput: unknown): Promise<AdminProductDetail> {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true } });
  if (!variant || variant.productId !== productId) {
    throw new AdminProductError(`Variant not found on this product: ${variantId}`, 404);
  }

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminProductError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter(
    (key) => !(ALLOWED_VARIANT_UPDATE_FIELDS as readonly string[]).includes(key)
  );
  if (disallowedKeys.length > 0) {
    throw new AdminProductError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const data: Prisma.ProductVariantUpdateInput = {};

  if ("price" in input) data.price = requirePositiveNumber(input.price, "price");
  if ("stockQuantity" in input) data.stockQuantity = requiredNonNegativeInteger(input.stockQuantity, "stockQuantity");
  if ("weight" in input) data.weight = optionalPositiveNumber(input.weight, "weight");
  if ("imageUrl" in input) data.imageUrl = optionalTrimmedString(input.imageUrl, "imageUrl", MAX_IMAGE_URL_LENGTH);
  if ("isActive" in input) data.isActive = Boolean(input.isActive);
  if ("sortOrder" in input) data.sortOrder = requiredNonNegativeInteger(input.sortOrder, "sortOrder");

  if ("sku" in input) {
    const sku = optionalTrimmedString(input.sku, "sku", MAX_SHORT_TEXT_LENGTH);
    if (sku) {
      await assertSkuAvailable(sku, variantId);
    }
    data.sku = sku;
  }
  if ("isbn" in input) data.isbn = parseOptionalIsbn(input.isbn);
  if ("gtin" in input) data.gtin = parseOptionalGtin(input.gtin);

  if (Object.keys(data).length === 0) {
    throw new AdminProductError("No editable fields were provided.");
  }

  await prisma.productVariant.update({ where: { id: variantId }, data });

  const product = await getProductForAdmin(productId);
  if (!product) throw new AdminProductError(`Product not found: ${productId}`, 404);
  return product;
}

// ---------------------------------------------------------------------------
// Remove a variant. Per the brief: a variant already referenced by an
// order must NEVER be hard-deleted (OrderItem.variantId would either
// break or, worse, silently point at a reused id) — deactivate it
// instead so it stops being purchasable but the historical order's
// immutable snapshot (variantLabel/variantOptionsSnapshot on OrderItem)
// remains fully intact and unaffected either way. A variant with no
// orders at all is safe to hard-delete outright.
// ---------------------------------------------------------------------------

export async function removeVariant(productId: string, variantId: string): Promise<AdminProductDetail> {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true } });
  if (!variant || variant.productId !== productId) {
    throw new AdminProductError(`Variant not found on this product: ${variantId}`, 404);
  }

  const referencedByOrder = await prisma.orderItem.findFirst({ where: { variantId }, select: { id: true } });

  if (referencedByOrder) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
  } else {
    await prisma.productVariant.delete({ where: { id: variantId } });
  }

  const product = await getProductForAdmin(productId);
  if (!product) throw new AdminProductError(`Product not found: ${productId}`, 404);
  return product;
}
