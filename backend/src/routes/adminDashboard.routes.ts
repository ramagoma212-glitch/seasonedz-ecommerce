// Version 7, Milestones 59 & 63: admin dashboard routes. Mounted at
// /api/admin in routes/index.ts (after /api/admin/auth, so the more
// specific auth router always matches auth requests first).
//
// requireAdminAuth is applied once, at the router level, rather than
// per-handler — the same discipline VERSION_7_ADMIN_DASHBOARD_PLAN.md
// calls for, so a route added later under this router can never
// accidentally ship unauthenticated.
//
// Every route was a GET until Milestone 63, which added order status
// update, and Milestone 66, which adds product create/edit. Still no
// DELETE route touches a Product row itself (see
// VERSION_7_PRODUCT_MANAGEMENT_PLAN.md Section 5 — ARCHIVED status is
// the safe alternative to deleting a product) — Milestone 74's
// DELETE .../images/:imageId only ever removes one ProductImage row.
//
// Route order matters for the /products family: "/products/low-stock"
// (a literal path, Milestone 59) must stay registered before
// "/products/:id" (a wildcard, Milestone 66), otherwise Express would
// match a request for "/products/low-stock" against the wildcard route
// first, treating "low-stock" as if it were a product id.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  getDashboardHandler,
  getLowStockProductsHandler,
  getOrderDetailHandler,
  listEnquiriesHandler,
  listOrdersHandler,
} from "../controllers/adminDashboard.controller.js";
import { getOrderStatusHistoryHandler, updateOrderStatusHandler } from "../controllers/adminOrderStatus.controller.js";
import { updateShippingHandler } from "../controllers/adminShipping.controller.js";
import { bookCourierShipmentHandler, getCourierQuoteHandler } from "../controllers/adminCourier.controller.js";
import {
  createAdminProductHandler,
  getAdminProductHandler,
  listAdminProductsHandler,
  updateAdminProductHandler,
} from "../controllers/adminProduct.controller.js";
import {
  deleteAdminProductImageHandler,
  listAdminProductImagesHandler,
  updateAdminProductImageHandler,
  uploadAdminProductImageHandler,
  uploadProductImageMiddleware,
} from "../controllers/adminProductImage.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/dashboard", getDashboardHandler);
router.get("/orders", listOrdersHandler);
router.get("/orders/:orderNumber", getOrderDetailHandler);
router.patch("/orders/:orderNumber/status", updateOrderStatusHandler);
router.get("/orders/:orderNumber/status-history", getOrderStatusHistoryHandler);
// Version 7, Milestone 106: manual shipping update — see
// adminShipping.service.ts's own header comment for why
// Order.fulfilmentStatus and Shipping.status are written together.
// No courier API is called anywhere behind this route.
router.patch("/orders/:orderNumber/shipping", updateShippingHandler);
// Version 7, Milestone 108: admin-only Courier Guy RATE QUOTE only —
// see courierGuy.service.ts's own header comment for why no booking/
// shipment endpoint is ever called from here. Never mutates the order,
// shipping, or payment; POST only because a quote request carries
// parcel dimensions in its body, not because anything is created.
router.post("/orders/:orderNumber/courier/quote", getCourierQuoteHandler);
// Version 7, Milestone 112: admin-only Courier Guy BOOKING — gated
// behind COURIER_GUY_BOOKING_ENABLED (defaults false) in addition to
// COURIER_GUY_ENABLED; see courierGuy.service.ts's own header comment.
// Only ever calls POST /shipments — never a label/waybill endpoint.
router.post("/orders/:orderNumber/courier/book", bookCourierShipmentHandler);
router.get("/enquiries", listEnquiriesHandler);
router.get("/products", listAdminProductsHandler);
router.post("/products", createAdminProductHandler);
router.get("/products/low-stock", getLowStockProductsHandler);
router.get("/products/:id", getAdminProductHandler);
router.patch("/products/:id", updateAdminProductHandler);
// Version 7, Milestone 69: image sub-routes. No route-ordering
// conflict with "/products/:id" above — these have one more path
// segment, so Express only matches them against a request that
// actually includes "/images". Milestone 74 adds DELETE — single
// image only, never bulk, never the product itself.
router.get("/products/:id/images", listAdminProductImagesHandler);
router.post("/products/:id/images", uploadProductImageMiddleware, uploadAdminProductImageHandler);
router.patch("/products/:id/images/:imageId", updateAdminProductImageHandler);
router.delete("/products/:id/images/:imageId", deleteAdminProductImageHandler);

export default router;
