// Content Studio Phase 2: Brand Knowledge Foundation only — no
// campaign, generation job, social account or scheduling route exists
// anywhere in this file or this phase. Mounted at
// /api/admin/content-studio in routes/index.ts.
//
// requireAdminAuth is applied once at the router level, the same
// discipline every other admin router already follows — any signed-in
// admin (ADMIN or STAFF) can read. requireAdminRole("ADMIN") is
// additionally applied per write route only (brief section 22: ADMIN
// gets full management, STAFF gets read access) — the first role-gated
// routes this backend has ever had. See requireAdminRole.middleware.ts.

import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import {
  createBrandKnowledgeEntryHandler,
  deactivateBrandKnowledgeEntryHandler,
  getBrandKnowledgeEntryHandler,
  listBrandKnowledgeEntriesHandler,
  reactivateBrandKnowledgeEntryHandler,
  updateBrandKnowledgeEntryHandler,
} from "../controllers/brandKnowledge.controller.js";
import {
  createContentPillarHandler,
  deactivateContentPillarHandler,
  getContentPillarHandler,
  listContentPillarsHandler,
  reactivateContentPillarHandler,
  updateContentPillarHandler,
} from "../controllers/contentPillar.controller.js";
import {
  createAudienceHandler,
  deactivateAudienceHandler,
  getAudienceHandler,
  listAudiencesHandler,
  reactivateAudienceHandler,
  updateAudienceHandler,
} from "../controllers/audience.controller.js";

const router = Router();

router.use(requireAdminAuth);

const adminOnly = requireAdminRole(UserRole.ADMIN);

router.get("/brand-knowledge", listBrandKnowledgeEntriesHandler);
router.get("/brand-knowledge/:id", getBrandKnowledgeEntryHandler);
router.post("/brand-knowledge", adminOnly, createBrandKnowledgeEntryHandler);
router.patch("/brand-knowledge/:id", adminOnly, updateBrandKnowledgeEntryHandler);
router.patch("/brand-knowledge/:id/deactivate", adminOnly, deactivateBrandKnowledgeEntryHandler);
router.patch("/brand-knowledge/:id/reactivate", adminOnly, reactivateBrandKnowledgeEntryHandler);

router.get("/pillars", listContentPillarsHandler);
router.get("/pillars/:id", getContentPillarHandler);
router.post("/pillars", adminOnly, createContentPillarHandler);
router.patch("/pillars/:id", adminOnly, updateContentPillarHandler);
router.patch("/pillars/:id/deactivate", adminOnly, deactivateContentPillarHandler);
router.patch("/pillars/:id/reactivate", adminOnly, reactivateContentPillarHandler);

router.get("/audiences", listAudiencesHandler);
router.get("/audiences/:id", getAudienceHandler);
router.post("/audiences", adminOnly, createAudienceHandler);
router.patch("/audiences/:id", adminOnly, updateAudienceHandler);
router.patch("/audiences/:id/deactivate", adminOnly, deactivateAudienceHandler);
router.patch("/audiences/:id/reactivate", adminOnly, reactivateAudienceHandler);

export default router;
