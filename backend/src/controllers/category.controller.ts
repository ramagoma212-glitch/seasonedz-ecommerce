import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as categoryService from "../services/category.service.js";
import * as productService from "../services/product.service.js";
import { toProductOutput } from "../services/product.service.js";

export async function listCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await categoryService.getCategories();
    sendSuccess(res, {
      message: "Categories retrieved successfully",
      data: { categories, count: categories.length },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) {
      sendError(res, { message: "Category slug is required", statusCode: 400 });
      return;
    }

    const category = await categoryService.getCategoryBySlug(slug);
    if (!category) {
      sendError(res, { message: `Category not found: ${slug}`, statusCode: 404 });
      return;
    }

    const products = await productService.getProductsByCategorySlug(slug);

    sendSuccess(res, {
      message: "Category products retrieved successfully",
      data: {
        category,
        products: products.map(toProductOutput),
        count: products.length,
      },
    });
  } catch (error) {
    next(error);
  }
}
