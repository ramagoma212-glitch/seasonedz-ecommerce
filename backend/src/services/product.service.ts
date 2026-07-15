import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { SortOption, StockOption } from "../utils/query.js";

// Every public product query goes through this include so the shape
// available to toProductOutput() is always the same.
const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" } },
  tags: true,
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
}

// Built field-by-field (never a `{ ...product }` spread) so internal-only
// columns — costPrice above all — can never accidentally leak into the
// API response just because a new field gets added to the Prisma model.
export function toProductOutput(product: ProductWithRelations): ProductOutput {
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
    description: product.description,
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
  };
}
