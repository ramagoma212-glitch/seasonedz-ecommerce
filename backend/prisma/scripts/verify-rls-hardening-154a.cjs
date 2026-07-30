// Milestone 154A verification script. Safe to run both BEFORE and
// AFTER applying backend/prisma/rls_hardening_154A.sql — every check
// here is read-only against either the live public HTTP endpoints or
// Postgres system catalogs (pg_tables/pg_roles/information_schema).
// Never creates an order, payment, or shipment. Never prints a secret,
// key, or token — only pass/fail booleans and non-sensitive metadata
// (table names, HTTP status codes, row counts).
//
// Run via plain `node` against the compiled dist/ output (not `npx
// tsx`) — see backend/SUPABASE_RLS_HARDENING_154A.md's own notes on why
// tsx's module resolution can spuriously fail against this project's
// Supabase pooler. From backend/: `node prisma/scripts/verify-rls-hardening-154a.cjs`

const { prisma } = require("../../dist/config/prisma.js");

const API_BASE = "https://api.seasonedzgroup.co.za/api";
const SUPABASE_PROJECT_URL = "https://mswnhwsksocsrbcrdzyb.supabase.co";

const EXPECTED_TABLES = [
  "Address", "AdminSession", "AdminUser", "Category", "Customer",
  "CustomerSession", "DigitalAsset", "DigitalDownloadLog", "Enquiry",
  "GuestDownloadToken", "Order", "OrderItem", "OrderStatusHistory",
  "Payment", "Product", "ProductImage", "ProductTag",
  "Shipping", "_ProductToProductTag", "_prisma_migrations",
];

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  OK   - ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
  }
}

async function httpStatus(url, options) {
  const res = await fetch(url, options);
  return res.status;
}

async function main() {
  console.log("=== Milestone 154A RLS hardening verification ===\n");

  console.log("[1] Backend API — public product catalogue still readable");
  const productsStatus = await httpStatus(`${API_BASE}/products?limit=1`);
  check("GET /api/products returns 200", productsStatus === 200, `status ${productsStatus}`);

  console.log("\n[2] Backend API — admin routes still require auth");
  const adminStatus = await httpStatus(`${API_BASE}/admin/products`);
  check("GET /api/admin/products returns 401 (unauthenticated)", adminStatus === 401, `status ${adminStatus}`);

  console.log("\n[3] Backend API — health check");
  const healthStatus = await httpStatus(`${API_BASE}/health`);
  check("GET /api/health returns 200", healthStatus === 200, `status ${healthStatus}`);

  console.log("\n[4] Supabase Data API — unauthenticated request is rejected (no key used, none needed for this check)");
  const restStatus = await httpStatus(`${SUPABASE_PROJECT_URL}/rest/v1/Customer`);
  check("GET /rest/v1/Customer with no apikey returns 401", restStatus === 401, `status ${restStatus}`);

  console.log("\n[5] Database — RLS state and grants (read-only system-catalog queries only)");
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
  );
  check("exactly 20 public tables found", tables.length === 20, `found ${tables.length}`);
  const foundNames = tables.map((t) => t.tablename).sort();
  const expectedSorted = [...EXPECTED_TABLES].sort();
  check(
    "table list matches the 20 expected tables",
    JSON.stringify(foundNames) === JSON.stringify(expectedSorted)
  );

  const rlsEnabledCount = tables.filter((t) => t.rowsecurity === true).length;
  console.log(`  INFO - tables with RLS enabled: ${rlsEnabledCount}/20 (0 = fix not yet applied, 20 = fix applied)`);

  const grants = await prisma.$queryRawUnsafe(`
    SELECT table_name, grantee FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
  `);
  console.log(`  INFO - anon/authenticated grant rows remaining: ${grants.length} (0 = fix applied, 280 = fix not yet applied [7 privileges x 20 tables x 2 roles])`);

  const roleInfo = await prisma.$queryRawUnsafe(
    "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;"
  );
  check("app's own DB role still has BYPASSRLS (unaffected by the fix either way)", roleInfo[0]?.rolbypassrls === true);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Verification script error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
