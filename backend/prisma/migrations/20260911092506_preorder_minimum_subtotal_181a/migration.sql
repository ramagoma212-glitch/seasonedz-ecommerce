-- Milestone 181A: owner rule change — the first-registered-customer
-- preorder discount now only applies once the order's own eligible
-- preorder subtotal reaches this programme-level minimum (default
-- R200.00, owner-approved). Purely additive: one nullable-free column
-- with a DEFAULT, so the one existing PreorderProgrammeSettings row
-- (and any future one) is backfilled automatically — no data
-- migration, no backfill script, nothing else touched.
--
-- Generated offline via `prisma migrate diff --from-schema-datamodel
-- --to-schema-datamodel --script` (a pure two-schema-file diff — no
-- database connection of any kind, shadow or otherwise) and verified
-- by hand against schema.prisma's own new field before being placed
-- here. No local/Docker Postgres was available in this environment to
-- run `prisma migrate dev` against a disposable shadow database
-- instead; this diff-only method touches no database, live or
-- disposable, which is at least as safe for a single additive column.

-- AlterTable
ALTER TABLE "PreorderProgrammeSettings" ADD COLUMN     "minimumEligiblePreorderSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 200.00;
