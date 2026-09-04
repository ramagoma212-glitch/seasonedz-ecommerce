import { Prisma, ProductStatus, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { SortOption, StockOption } from "../utils/query.js";
import { sanitizeDescriptionHtml } from "../utils/descriptionSanitizer.js";
import { isActivePreorder, isActivePreorderDiscountEligible } from "./preorder.service.js";

// Every public product query goes through this include so the shape
// available to toProductOutput() is always the same.
//
// Version 7, Milestone 152: digitalAsset selects only the safe, public-
// facing metadata a customer needs to decide whether to buy — never
// storageBucket/storagePath (see digitalAssetStorage.service.ts's own
// header comment on why those must never reach a frontend response) and
// never the internal fileName either (displayName is the one the
// storefront ever shows).
const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" } },
  tags: true,
  digitalAsset: {
    select: { displayName: true, mimeType: true, fileSizeBytes: true, pageCount: true, version: true, isActive: true },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export interface ProductFilters {
  search?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  ageRange?: string;
  tagSlug?: string;
  stock?: StockOption;
}

// A product page/card is still useful while temporarily out of stock,
// so slug lookups and the "out-of-stock" filter are allowed to surface
// OUT_OF_STOCK products. DRAFT and ARCHIVED are never shown publicly,
// under any filter combination.
const VISIBLE_STATUSES: ProductStatus[] = [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK];

function buildOrderBy(sort: SortOption): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" }];
    case "price-desc":
      return [{ price: "desc" }];
    case "rating":
      return [{ ratingAverage: "desc" }, { reviewCount: "desc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "name-asc":
      return [{ name: "asc" }];
    case "featured":
    default:
      return [{ isFeatured: "desc" }, { createdAt: "desc" }];
  }
}

function buildWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (filters.stock === "in-stock") {
    and.push({ status: ProductStatus.ACTIVE, stockQuantity: { gt: 0 } });
  } else if (filters.stock === "out-of-stock") {
    and.push({
      OR: [{ status: ProductStatus.OUT_OF_STOCK }, { status: ProductStatus.ACTIVE, stockQuantity: { lte: 0 } }],
    });
  } else {
    // No stock filter requested — the public default is active products only.
    and.push({ status: ProductStatus.ACTIVE });
  }

  if (filters.categorySlug) {
    and.push({ category: { slug: filters.categorySlug } });
  }

  if (filters.tagSlug) {
    and.push({ tags: { some: { slug: filters.tagSlug } } });
  }

  if (filters.minPrice !== undefined) {
    and.push({ price: { gte: filters.minPrice } });
  }

  if (filters.maxPrice !== undefined) {
    and.push({ price: { lte: filters.maxPrice } });
  }

  if (filters.ageRange) {
    and.push({ ageRange: { contains: filters.ageRange, mode: "insensitive" } });
  }

  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { shortDescription: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { ageRange: { contains: filters.search, mode: "insensitive" } },
        { category: { name: { contains: filters.search, mode: "insensitive" } } },
        { tags: { some: { name: { contains: filters.search, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND: and };
}

export async function getProducts(filters: ProductFilters, sort: SortOption): Promise<ProductWithRelations[]> {
  return prisma.product.findMany({
    where: buildWhere(filters),
    include: productInclude,
    orderBy: buildOrderBy(sort),
  });
}

export async function getProductBySlug(slug: string): Promise<ProductWithRelations | null> {
  return prisma.product.findFirst({
    where: { slug, status: { in: VISIBLE_STATUSES } },
    include: productInclude,
  });
}

export async function getFeaturedProducts(): Promise<ProductWithRelations[]> {
  return prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE, isFeatured: true },
    include: productInclude,
    orderBy: buildOrderBy("newest"),
  });
}

export async function getBestSellers(): Promise<ProductWithRelations[]> {
  return prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE, isBestSeller: true },
    include: productInclude,
    orderBy: buildOrderBy("newest"),
  });
}

export async function getNewArrivals(): Promise<ProductWithRelations[]> {
  return prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE, isNewArrival: true },
    include: productInclude,
    orderBy: buildOrderBy("newest"),
  });
}

// Reuses getProducts() rather than duplicating buildWhere()/buildOrderBy()
// logic, so /api/products?category=X and /api/categories/:slug/products
// can never silently drift apart in behaviour.
export async function getProductsByCategorySlug(categorySlug: string): Promise<ProductWithRelations[]> {
  return getProducts({ categorySlug }, "featured");
}

function deriveStockStatus(stockQuantity: number, lowStockThreshold: number, status: ProductStatus): string {
  if (status === ProductStatus.OUT_OF_STOCK || stockQuantity <= 0) {
    return "Out of Stock";
  }
  if (stockQuantity <= lowStockThreshold) {
    return "Low Stock";
  }
  return "In Stock";
}

function getPrimaryImageUrl(images: ProductWithRelations["images"]): string | null {
  const primary = images.find((image) => image.isPrimary) ?? images[0];
  return primary ? primary.url : null;
}

export interface ProductOutput {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  category: { id: string; name: string; slug: string };
  price: number;
  oldPrice: number | null;
  stockQuantity: number;
  stockStatus: string;
  image: string | null;
  gallery: string[];
  shortDescription: string | null;
  description: string | null;
  features: Prisma.JsonValue | null;
  ageRange: string | null;
  tags: string[];
  ratingAverage: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  discountLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  productType: ProductType;
  digitalDownload: {
    displayName: string;
    fileType: string;
    fileSizeBytes: number;
    pageCount: number | null;
    version: string | null;
    termsNote: string | null;
  } | null;
  // Milestone 181, Part J: computed, never a raw admin flag — a customer
  // (or the storefront's own logic, e.g. isOutOfStockForCart()) must
  // never see isPreorderEnabled=true for a Product that is merely
  // scheduled or has already ended. preorderReleaseAt is only ever
  // populated alongside isPreorder=true, so callers never need to
  // re-check the two together.
  isPreorder: boolean;
  isPreorderDiscountEligible: boolean;
  preorderReleaseAt: Date | null;
}

// "PDF"/"ZIP" for the two allowed upload types (adminDigitalAsset.
// service.ts); any other stored mimeType (shouldn't happen — upload
// validation only ever accepts those two) falls back to a generic,
// still-safe label rather than guessing.
function humanizeFileType(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return "ZIP";
  return "File";
}

// Version 7, Milestone 146 (post-review fix): every product row already
// goes through sanitizeDescriptionHtml() on the way IN (adminProduct.
// service.ts's optionalDescriptionHtml()), but rows written before this
// milestone existed were never sanitised on save — including, in
// principle, an old description that was pasted straight into the
// original plain <textarea> and happens to contain real HTML (that
// textarea never executed it, but the OLD unescaped `<p>${description}</p>`
// rendering on the product page would have). Sanitising again here, on
// every public read, closes that gap regardless of how old or new a
// row is — this is the one function every public product response (list,
// detail, featured, best-sellers, new arrivals, search, category) passes
// through, so there is no separate public endpoint this could miss.
// Plain text with no markup at all passes through completely unchanged
// (nothing for the allowlist to strip), so legacy descriptions are
// never altered, only ever protected.
function sanitizePublicDescription(description: string | null): string | null {
  if (!description) return description;
  return sanitizeDescriptionHtml(description);
}

// Built field-by-field (never a `{ ...product }` spread) so internal-only
// columns — costPrice above all — can never accidentally leak into the
// API response just because a new field gets added to the Prisma model.
export function toProductOutput(product: ProductWithRelations): ProductOutput {
  const preorderNow = new Date();
  const isPreorder = isActivePreorder(product, product.status, preorderNow);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    price: product.price.toNumber(),
    oldPrice: product.oldPrice ? product.oldPrice.toNumber() : null,
    stockQuantity: product.stockQuantity,
    stockStatus: deriveStockStatus(product.stockQuantity, product.lowStockThreshold, product.status),
    image: getPrimaryImageUrl(product.images),
    gallery: product.images.map((image) => image.url),
    shortDescription: product.shortDescription,
    description: sanitizePublicDescription(product.description),
    features: product.features,
    ageRange: product.ageRange,
    tags: product.tags.map((tag) => tag.name),
    ratingAverage: product.ratingAverage.toNumber(),
    reviewCount: product.reviewCount,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    discountLabel: product.discountLabel,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    productType: product.productType,
    digitalDownload:
      product.productType === ProductType.DIGITAL && product.digitalAsset && product.digitalAsset.isActive
        ? {
            displayName: product.digitalAsset.displayName,
            fileType: humanizeFileType(product.digitalAsset.mimeType),
            fileSizeBytes: product.digitalAsset.fileSizeBytes,
            pageCount: product.digitalAsset.pageCount,
            version: product.digitalAsset.version,
            termsNote: product.digitalTermsNote,
          }
        : null,
    isPreorder,
    isPreorderDiscountEligible: isActivePreorderDiscountEligible(product, product.status, preorderNow),
    preorderReleaseAt: isPreorder ? product.preorderReleaseAt : null,
  };
}
