// All API routes mount here, and this router mounts at /api in app.ts —
// so this file becomes the single place to see every route group that
// exists (e.g. /api/health). New route groups (products, orders, etc.
// in later milestones) get added here the same way.

import { Router } from "express";
import healthRoutes from "./health.routes.js";
import productRoutes from "./product.routes.js";
import categoryRoutes from "./category.routes.js";
import orderRoutes from "./order.routes.js";
import enquiryRoutes from "./enquiry.routes.js";
import paymentRoutes from "./payment.routes.js";
import adminAuthRoutes from "./adminAuth.routes.js";
import adminDashboardRoutes from "./adminDashboard.routes.js";
import customerRoutes from "./customer.routes.js";
import downloadsRoutes from "./downloads.routes.js";
import newsletterRoutes from "./newsletter.routes.js";
import socialAuthRoutes from "./socialAuth.routes.js";
import adminAffiliateRoutes from "./adminAffiliate.routes.js";
import adminReferralsRoutes from "./adminReferrals.routes.js";
import referralsRoutes from "./referrals.routes.js";
import courierWebhookRoutes from "./courierWebhook.routes.js";
import checkoutIntentRoutes from "./checkoutIntent.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/enquiries", enquiryRoutes);
router.use("/payments", paymentRoutes);
// Version 7, Milestone 58: admin auth — login/logout/me.
router.use("/admin/auth", adminAuthRoutes);
// Version 7, Milestone 59: read-only admin dashboard (overview, order
// list/detail, enquiry list, low-stock products). Every route here is
// a GET, protected end-to-end by requireAdminAuth (applied at the
// router level in adminDashboard.routes.ts) — no write/mutation admin
// route exists anywhere under /api/admin yet.
router.use("/admin", adminDashboardRoutes);
// Version 7, Milestone 127: customer auth backend foundation —
// register/login/logout/me only, no order history yet, and not linked
// from any public frontend page yet. Fully separate from adminAuth
// above — see customerAuth.service.ts's own header comment.
router.use("/customers", customerRoutes);
// Version 7, Milestone 152: guest secure-token digital download access
// — deliberately public (see downloads.routes.ts's own comment).
router.use("/downloads", downloadsRoutes);
// Version 7, Milestone 168F: homepage newsletter signup — public,
// unauthenticated, write-only, same shape as /enquiries above.
router.use("/newsletter", newsletterRoutes);
// Version 7, Milestone 171F: Google/Facebook/Apple social sign-in —
// fully additive to customerAuth above, ends in the exact same
// customer_session cookie. See socialAuth.routes.ts.
router.use("/auth", socialAuthRoutes);
// Version 7, Milestone 172B: admin affiliate-product management —
// requireAdminAuth applied at the router level, see
// adminAffiliate.routes.ts's own header comment. No public affiliate
// route is mounted anywhere yet; that's Milestone 172C.
router.use("/admin/affiliate", adminAffiliateRoutes);
// Version 7, Milestone 172B.3: Seasonedz's own affiliate/referral
// programme — fully separate router/path from /admin/affiliate above.
// requireAdminAuth applied at the router level, see
// adminReferrals.routes.ts's own header comment.
router.use("/admin/referrals", adminReferralsRoutes);
// Version 7, Milestone 172B.4: public, unauthenticated referral
// capture/preview — the live checkout-facing counterpart to the
// admin-only /admin/referrals above. See referrals.routes.ts's own
// header comment for why these stay two fully separate routers.
router.use("/referrals", referralsRoutes);
// Version 7, Milestone 173: inbound Courier Guy (ShipLogic) tracking
// webhook. Deliberately its own top-level "/webhooks" group (not
// nested under /admin or /customers) — a server-to-server callback,
// same category as PayFast's own /payments/payfast/notify. See
// courierWebhook.controller.ts for the full security model.
router.use("/webhooks", courierWebhookRoutes);
// Version 7, Milestone 174C: abandoned checkout recovery — public,
// unauthenticated. See checkoutIntent.routes.ts's own header comment.
router.use("/checkout-intent", checkoutIntentRoutes);

export default router;
