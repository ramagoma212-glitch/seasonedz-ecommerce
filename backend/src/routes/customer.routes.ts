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
import { applyForAffiliateProgrammeHandler, getMyAffiliatePortalHandler } from "../controllers/customerAffiliate.controller.js";
import {
  getMyApplicationHandler,
  getMyDocumentSignedUrlHandler,
  submitMyApplicationHandler,
  updateMyApplicationHandler,
  uploadAffiliateDocumentMiddleware,
  uploadMyDocumentHandler,
} from "../controllers/affiliateApplication.controller.js";
import {
  listMyNotificationsHandler,
  getMyNotificationHandler,
  markMyNotificationReadHandler,
  markAllMyNotificationsReadHandler,
} from "../controllers/customerNotification.controller.js";
import { getMyNotificationPreferencesHandler, updateMyNotificationPreferencesHandler } from "../controllers/notificationPreference.controller.js";
import { subscribeToStockAlertHandler } from "../controllers/stockAlert.controller.js";
import { listMyWishlistHandler, addToMyWishlistHandler, removeFromMyWishlistHandler, mergeMyWishlistHandler } from "../controllers/wishlist.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.middleware.js";
import {
  customerForgotPasswordRateLimiter,
  customerLoginRateLimiter,
  customerRegisterRateLimiter,
  customerResetPasswordRateLimiter,
  productReviewCreationRateLimiter,
  customerAffiliateApplyRateLimiter,
  stockAlertSubscribeRateLimiter,
  affiliateApplicationFormRateLimiter,
  affiliateDocumentUploadRateLimiter,
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

// Version 7, Milestone 172B.6: affiliate portal — reuses this exact
// customer session, never a second affiliate login. Affiliate identity
// is always derived server-side from req.customerUser.id
// (customerAffiliate.service.ts), never from anything the client sends.
router.get("/affiliate", requireCustomerAuth, getMyAffiliatePortalHandler);
router.post("/affiliate/apply", requireCustomerAuth, customerAffiliateApplyRateLimiter, applyForAffiliateProgrammeHandler);

// Version 7, Milestone 176: affiliate application/verification — same
// customer session, identity always derived from req.customerUser.id
// (affiliateApplication.service.ts's own requireOwnedApplication()),
// never from a client-supplied application id (brief section 48).
router.get("/affiliate/application", requireCustomerAuth, getMyApplicationHandler);
router.patch("/affiliate/application", requireCustomerAuth, affiliateApplicationFormRateLimiter, updateMyApplicationHandler);
router.post("/affiliate/application/submit", requireCustomerAuth, affiliateApplicationFormRateLimiter, submitMyApplicationHandler);
router.post("/affiliate/application/documents", requireCustomerAuth, affiliateDocumentUploadRateLimiter, uploadAffiliateDocumentMiddleware, uploadMyDocumentHandler);
router.get("/affiliate/application/documents/:documentId/signed-url", requireCustomerAuth, getMyDocumentSignedUrlHandler);

// Version 7, Milestone 174C: the Customer Notification Centre — see
// customerNotification.service.ts's own header comment. "/notifications/read-all"
// is registered before "/notifications/:id" so Express never matches
// the literal "read-all" segment against the wildcard :id route, same
// ordering discipline adminDashboard.routes.ts's own comment already
// documents for "/products/low-stock" vs "/products/:id".
router.get("/notifications", requireCustomerAuth, listMyNotificationsHandler);
router.patch("/notifications/read-all", requireCustomerAuth, markAllMyNotificationsReadHandler);
router.get("/notifications/:id", requireCustomerAuth, getMyNotificationHandler);
router.patch("/notifications/:id/read", requireCustomerAuth, markMyNotificationReadHandler);

// Version 7, Milestone 174C: engagement preferences (review requests,
// stock/wishlist alerts, abandoned checkout) — see
// notificationPreference.service.ts's own header comment. Essential/
// transactional notifications have no opt-out and therefore no
// endpoint here at all.
router.get("/notification-preferences", requireCustomerAuth, getMyNotificationPreferencesHandler);
router.patch("/notification-preferences", requireCustomerAuth, updateMyNotificationPreferencesHandler);

// Version 7, Milestone 174C: back-in-stock — see stockAlert.service.ts's
// own header comment for why this is logged-in-only.
router.post("/stock-alerts", requireCustomerAuth, stockAlertSubscribeRateLimiter, subscribeToStockAlertHandler);

// Version 7, Milestone 174C: server-backed wishlist — see
// wishlist.service.ts's own header comment. "/wishlist/merge" is
// registered before "/wishlist/:productId" so Express never matches
// the literal "merge" segment against the wildcard :productId route.
router.get("/wishlist", requireCustomerAuth, listMyWishlistHandler);
router.post("/wishlist", requireCustomerAuth, addToMyWishlistHandler);
router.post("/wishlist/merge", requireCustomerAuth, mergeMyWishlistHandler);
router.delete("/wishlist/:productSlug", requireCustomerAuth, removeFromMyWishlistHandler);

export default router;
