import type { Category } from "@prisma/client";
import { ProductStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface CategoryOutput {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
  isActive: boolean;
  sortOrder: number;
}

// productCount always counts ACTIVE products only — it's meant to answer
// "how many products would a customer see in this category", matching
// the default (no stock filter) behaviour of the product list endpoints.
function toCategoryOutput(category: Category, productCount: number): CategoryOutput {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    productCount,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

export async function getCategoriesWithProductCounts(): Promise<CategoryOutput[]> {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.product.groupBy({
      by: ["categoryId"],
      where: { status: ProductStatus.ACTIVE },
      _count: { _all: true },
    }),
  ]);

  const countByCategoryId = new Map(counts.map((entry) => [entry.categoryId, entry._count._all]));

  return categories.map((category) => toCategoryOutput(category, countByCategoryId.get(category.id) ?? 0));
}

export async function getCategories(): Promise<CategoryOutput[]> {
  return getCategoriesWithProductCounts();
}

export async function getCategoryBySlug(slug: string): Promise<CategoryOutput | null> {
  const category = await prisma.category.findFirst({ where: { slug, isActive: true } });
  if (!category) {
    return null;
  }

  const productCount = await prisma.product.count({
    where: { categoryId: category.id, status: ProductStatus.ACTIVE },
  });

  return toCategoryOutput(category, productCount);
}
