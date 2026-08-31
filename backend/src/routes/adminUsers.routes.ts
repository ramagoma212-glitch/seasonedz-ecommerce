// Milestone 179, Part G: admin-user management. Mounted at
// /api/admin/users in routes/index.ts. Every route here requires a
// valid admin session AND the ADMIN role — the brief calls this out as
// an "ADMIN-only management area" as a whole (not just its write
// actions), so both gates are applied once, at the router level,
// before any handler runs. A STAFF session reaches every route here
// exactly the same as an unauthenticated request: 403.

import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import {
  changeAdminUserRoleHandler,
  inviteAdminUserHandler,
  listAdminUsersHandler,
  reissueInvitationHandler,
  setAdminUserActiveHandler,
} from "../controllers/adminUsers.controller.js";

const router = Router();

router.use(requireAdminAuth, requireAdminRole(UserRole.ADMIN));

router.get("/", listAdminUsersHandler);
router.post("/invite", inviteAdminUserHandler);
router.post("/:id/reissue-invitation", reissueInvitationHandler);
router.patch("/:id/role", changeAdminUserRoleHandler);
router.patch("/:id/status", setAdminUserActiveHandler);

export default router;
