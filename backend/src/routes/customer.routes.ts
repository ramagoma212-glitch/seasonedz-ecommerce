// Customer auth + order history routes (Version 7, Milestone 127
// backend foundation; order history added Milestone 130; password
// reset added Milestone 132). Mounted at /api/customers in
// routes/index.ts.

import { Router } from "express";
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  resetPasswordHandler,
} from "../controllers/customerAuth.controller.js";
import { getCustomerOrderHandler, listCustomerOrdersHandler } from "../controllers/customerOrder.controller.js";
import { getCustomerOrderDownloadsHandler, requestCustomerDownloadHandler } from "../controllers/digitalDownload.controller.js";
import {
  listEligibleReviewCandidatesHandler,
  listMyReviewsHandler,
  submitProductReviewHandler,
} from "../controllers/productReview.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.middleware.js";
import {
  customerForgotPasswordRateLimiter,
  customerLoginRateLimiter,
  customerRegisterRateLimiter,
  customerResetPasswordRateLimiter,
  productReviewCreationRateLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", customerRegisterRateLimiter, registerHandler);
router.post("/login", customerLoginRateLimiter, loginHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireCustomerAuth, meHandler);

// Version 7, Milestone 132: neither requires requireCustomerAuth — a
// customer forgetting their password is, by definition, not logged in.
router.post("/forgot-password", customerForgotPasswordRateLimiter, forgotPasswordHandler);
router.post("/reset-password", customerResetPasswordRateLimiter, resetPasswordHandler);

// Version 7, Milestone 130: both require requireCustomerAuth — a
// logged-out request never reaches customerOrder.controller.ts at all.
router.get("/orders", requireCustomerAuth, listCustomerOrdersHandler);
router.get("/orders/:orderNumber", requireCustomerAuth, getCustomerOrderHandler);

// Version 7, Milestone 152: secure digital downloads — both require
// requireCustomerAuth, same as the order-history routes above.
// digitalDownload.service.ts independently re-verifies that the order
// (and, for the second route, this specific order item) really belongs
// to req.customerUser.id and really is PAID on every single call.
router.get("/orders/:orderNumber/downloads", requireCustomerAuth, getCustomerOrderDownloadsHandler);
router.post("/downloads/:orderItemId/request", requireCustomerAuth, requestCustomerDownloadHandler);

// Version 7, Milestone 171C: genuine, verified-purchase product
// reviews. All three require requireCustomerAuth — productReview.
// service.ts independently re-verifies every purchase claim against
// req.customerUser.id on every call, same discipline as the download
// routes above never trusting a stored "already verified" flag.
router.get("/reviews/eligible", requireCustomerAuth, listEligibleReviewCandidatesHandler);
router.get("/reviews", requireCustomerAuth, listMyReviewsHandler);
router.post("/reviews", requireCustomerAuth, productReviewCreationRateLimiter, submitProductReviewHandler);

export default router;
