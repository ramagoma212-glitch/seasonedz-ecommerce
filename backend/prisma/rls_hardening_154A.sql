-- Milestone 154A: Supabase RLS hardening — proposed fix.
--
-- STATUS: NOT APPLIED. Reviewable plan only. Nothing in this repo's
-- CI/Render build or start command runs `prisma migrate deploy` or
-- executes arbitrary .sql files automatically (backend's build script
-- is only `prisma generate && tsc`) — this file sits inert until a
-- human deliberately runs it. It is intentionally NOT a Prisma
-- migration (Prisma's schema DSL has no RLS/GRANT directives).
--
-- See backend/SUPABASE_RLS_HARDENING_154A.md for the full audit,
-- evidence, and rationale behind every statement below.
--
-- HOW TO APPLY (only after owner review/approval): paste this whole
-- file into the Supabase Dashboard's SQL Editor for this project and
-- run it once, or `psql "$DIRECT_URL" -f backend/prisma/rls_hardening_154A.sql`
-- using the non-pooled direct connection string. Never paste a real
-- connection string or key into chat, a commit, or any logged output.
--
-- WHY THIS IS SAFE (confirmed live, read-only, 2026-07-30):
--   - The backend's ONLY Postgres role (`postgres`, both via pooled
--     DATABASE_URL and direct DIRECT_URL) has `rolbypassrls = true`
--     (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user).
--     BYPASSRLS ignores Row Level Security entirely, on every table,
--     always — so every statement below is invisible to the website,
--     admin, PayFast, Courier Guy, customer accounts, and digital
--     downloads, all of which share this one connection.
--   - The frontend never holds a Supabase anon key and never queries
--     Supabase tables directly (confirmed: no supabase-js/createClient
--     anywhere under src/, no SUPABASE_ANON_KEY anywhere in the repo,
--     the live JS bundle contains no such key). Only two backend files
--     use a separate SUPABASE_SERVICE_ROLE_KEY, only for Storage.
--   - Catalogue tables (Product, Category, ProductImage, ProductTag,
--     _ProductToProductTag) get the exact same lockdown as the
--     sensitive tables, deliberately: the storefront already reads
--     catalogue data exclusively through the backend API, so there is
--     no public-read policy this app actually needs.
--   - Prisma Migrate's DIRECT_URL authenticates as the identical
--     `postgres` role as the runtime DATABASE_URL (confirmed by
--     comparing only the username segment of each connection string),
--     so enabling RLS on _prisma_migrations cannot break future
--     `prisma migrate dev`/`deploy` runs.

BEGIN;

-- Step 1: remove the public Data API's access grants outright on every
-- table — sensitive and catalogue alike. This app has no legitimate use
-- for anon/authenticated on any of these 20 tables.
REVOKE ALL ON TABLE public."Address" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AdminSession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AdminUser" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Category" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Customer" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CustomerSession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."DigitalAsset" FROM anon, authenticated;
REVOKE ALL ON TABLE public."DigitalDownloadLog" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Enquiry" FROM anon, authenticated;
REVOKE ALL ON TABLE public."GuestDownloadToken" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Order" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OrderItem" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OrderStatusHistory" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Payment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Product" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ProductImage" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ProductTag" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Shipping" FROM anon, authenticated;
REVOKE ALL ON TABLE public."_ProductToProductTag" FROM anon, authenticated;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon, authenticated;

-- Step 2: enable Row Level Security, zero policies added anywhere.
-- Default-deny for any role that isn't postgres/service_role (which
-- always bypasses RLS regardless). No catalogue-read policy, no
-- exceptions — see rationale above for why none is needed. Deliberately
-- no FORCE ROW LEVEL SECURITY: the postgres role's BYPASSRLS already
-- makes FORCE irrelevant here, and omitting it keeps this the simplest
-- correct fix.
ALTER TABLE public."Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CustomerSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DigitalAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DigitalDownloadLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Enquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GuestDownloadToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrderStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Shipping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_ProductToProductTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Step 3 (forward-looking): without this, the next Prisma migration
-- that creates a new table would silently reinherit Supabase's default
-- public-schema grants to anon/authenticated — exactly how all 20
-- existing tables ended up exposed despite no app code ever requesting
-- it. This changes the default for future CREATE TABLE statements run
-- by the `postgres` role (the role every Prisma migration runs as); it
-- does not touch any existing table or require re-running Steps 1-2.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;

-- ROLLBACK (only if something unexpected breaks): re-grant and disable
-- RLS. Keep this exact list next to the fix so a revert never has to be
-- reconstructed under pressure.
--
-- BEGIN;
-- ALTER TABLE public."Address" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."AdminSession" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."AdminUser" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Category" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Customer" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."CustomerSession" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."DigitalAsset" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."DigitalDownloadLog" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Enquiry" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."GuestDownloadToken" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Order" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."OrderItem" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."OrderStatusHistory" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Payment" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Product" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."ProductImage" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."ProductTag" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."Shipping" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."_ProductToProductTag" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public."_prisma_migrations" DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON TABLE public."Address" TO anon, authenticated;
-- GRANT ALL ON TABLE public."AdminSession" TO anon, authenticated;
-- GRANT ALL ON TABLE public."AdminUser" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Category" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Customer" TO anon, authenticated;
-- GRANT ALL ON TABLE public."CustomerSession" TO anon, authenticated;
-- GRANT ALL ON TABLE public."DigitalAsset" TO anon, authenticated;
-- GRANT ALL ON TABLE public."DigitalDownloadLog" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Enquiry" TO anon, authenticated;
-- GRANT ALL ON TABLE public."GuestDownloadToken" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Order" TO anon, authenticated;
-- GRANT ALL ON TABLE public."OrderItem" TO anon, authenticated;
-- GRANT ALL ON TABLE public."OrderStatusHistory" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Payment" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Product" TO anon, authenticated;
-- GRANT ALL ON TABLE public."ProductImage" TO anon, authenticated;
-- GRANT ALL ON TABLE public."ProductTag" TO anon, authenticated;
-- GRANT ALL ON TABLE public."Shipping" TO anon, authenticated;
-- GRANT ALL ON TABLE public."_ProductToProductTag" TO anon, authenticated;
-- GRANT ALL ON TABLE public."_prisma_migrations" TO anon, authenticated;
-- COMMIT;
