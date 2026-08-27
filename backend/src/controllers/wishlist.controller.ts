// Version 7, Milestone 174C: server-backed wishlist — see
// wishlist.service.ts's own header comment. Every productSlug field
// below matches the frontend's own established "product identity =
// slug" convention (product.id throughout src/js/ and src/pages/ is
// always the slug, never the internal database id — see
// src/js/api/mappers.js's own mapApiProductToFrontendShape()).
import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { WishlistError, addToWishlist, listWishlistForCustomer, mergeGuestWishlistIntoAccount, removeFromWishlist } from "../services/wishlist.service.js";

export async function listMyWishlistHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const items = await listWishlistForCustomer(customerId);
    sendSuccess(res, { message: "Wishlist retrieved successfully", data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function addToMyWishlistHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const productSlug = typeof req.body?.productSlug === "string" ? req.body.productSlug.trim() : "";
    if (!productSlug) {
      sendError(res, { message: "productSlug is required.", statusCode: 400 });
      return;
    }

    await addToWishlist(customerId, productSlug);
    sendSuccess(res, { message: "Added to wishlist.", statusCode: 201 });
  } catch (error) {
    if (error instanceof WishlistError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function removeFromMyWishlistHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { productSlug } = req.params;
    if (!productSlug) {
      sendError(res, { message: "productSlug is required.", statusCode: 400 });
      return;
    }

    await removeFromWishlist(customerId, productSlug);
    sendSuccess(res, { message: "Removed from wishlist." });
  } catch (error) {
    next(error);
  }
}

// Called once, right after login — see wishlist.service.ts's own
// mergeGuestWishlistIntoAccount() comment. productSlugs always comes
// from the browser's own Local-Storage wishlist, sent explicitly by
// the frontend at login time; nothing here trusts it as anything more
// than "a list of product slugs to try merging in."
export async function mergeMyWishlistHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const productSlugs = Array.isArray(req.body?.productSlugs) ? req.body.productSlugs.filter((slug: unknown): slug is string => typeof slug === "string") : [];

    await mergeGuestWishlistIntoAccount(customerId, productSlugs);
    const items = await listWishlistForCustomer(customerId);
    sendSuccess(res, { message: "Wishlist merged successfully", data: { items } });
  } catch (error) {
    next(error);
  }
}
