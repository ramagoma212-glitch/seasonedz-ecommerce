import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePriceParam, parseSlugParam, parseSortParam, parseStockParam, parseStringParam } from "../utils/query.js";
import * as productService from "../services/product.service.js";
import { toProductOutput } from "../services/product.service.js";

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = parseStringParam(req.query.search);
    const category = parseSlugParam(req.query.category);
    const ageRange = parseStringParam(req.query.ageRange);
    const tag = parseSlugParam(req.query.tag);
    const stock = parseStockParam(req.query.stock);
    const sort = parseSortParam(req.query.sort);

    const minPrice = parsePriceParam(req.query.minPrice, "minPrice");
    if (minPrice.error) {
      sendError(res, { message: minPrice.error, statusCode: 400 });
      return;
    }

    const maxPrice = parsePriceParam(req.query.maxPrice, "maxPrice");
    if (maxPrice.error) {
      sendError(res, { message: maxPrice.error, statusCode: 400 });
      return;
    }

    if (minPrice.value !== undefined && maxPrice.value !== undefined && minPrice.value > maxPrice.value) {
      sendError(res, { message: "minPrice must not be greater than maxPrice", statusCode: 400 });
      return;
    }

    const products = await productService.getProducts(
      {
        search,
        categorySlug: category,
        minPrice: minPrice.value,
        maxPrice: maxPrice.value,
        ageRange,
        tagSlug: tag,
        stock,
      },
      sort
    );

    sendSuccess(res, {
      message: "Products retrieved successfully",
      data: {
        products: products.map(toProductOutput),
        count: products.length,
        filters: {
          search: search ?? null,
          category: category ?? null,
          minPrice: minPrice.value ?? null,
          maxPrice: maxPrice.value ?? null,
          ageRange: ageRange ?? null,
          tag: tag ?? null,
          stock: stock ?? null,
        },
        sort,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listFeaturedProducts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await productService.getFeaturedProducts();
    sendSuccess(res, {
      message: "Featured products retrieved successfully",
      data: { products: products.map(toProductOutput), count: products.length },
    });
  } catch (error) {
    next(error);
  }
}

export async function listBestSellers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await productService.getBestSellers();
    sendSuccess(res, {
      message: "Best sellers retrieved successfully",
      data: { products: products.map(toProductOutput), count: products.length },
    });
  } catch (error) {
    next(error);
  }
}

export async function listNewArrivals(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await productService.getNewArrivals();
    sendSuccess(res, {
      message: "New arrivals retrieved successfully",
      data: { products: products.map(toProductOutput), count: products.length },
    });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) {
      sendError(res, { message: "Product slug is required", statusCode: 400 });
      return;
    }

    const product = await productService.getProductBySlug(slug);

    if (!product) {
      sendError(res, { message: `Product not found: ${slug}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, {
      message: "Product retrieved successfully",
      data: toProductOutput(product),
    });
  } catch (error) {
    next(error);
  }
}
