// Milestone 181A: read-only pre-migration snapshot, run once against
// the real production database (backend/.env's DATABASE_URL — see
// TESTING_SAFETY.md) BEFORE `prisma migrate deploy` applies the new
// additive `minimumEligiblePreorderSubtotal` column. No pg_dump binary
// was available in this environment (checked: no psql/pg_dump/Docker
// on this machine) — this instead snapshots, via this project's own
// already-configured Prisma client, the exact row(s) in the one table
// the migration touches (PreorderProgrammeSettings), plus row counts
// for every table the migration must NOT affect, so a before/after
// diff can verify nothing unexpected changed. Never writes anything.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../../src/config/prisma.js";

async function main() {
  // Raw query, not prisma.preorderProgrammeSettings.findMany(): the
  // regenerated Prisma Client (from the already-edited schema.prisma)
  // now expects minimumEligiblePreorderSubtotal to exist, which it
  // does not yet — this snapshot is taken BEFORE that migration runs,
  // against the column set production genuinely has right now.
  const preorderSettings = await prisma.$queryRaw`SELECT * FROM "PreorderProgrammeSettings"`;
  const counts = {
    preorderProgrammeSettings: await prisma.preorderProgrammeSettings.count(),
    preorderDiscountRedemption: await prisma.preorderDiscountRedemption.count(),
    order: await prisma.order.count(),
    orderItem: await prisma.orderItem.count(),
  };

  const snapshot = {
    takenAt: new Date().toISOString(),
    purpose: "Milestone 181A pre-migration snapshot (minimumEligiblePreorderSubtotal additive column)",
    preorderProgrammeSettings: preorderSettings,
    counts,
  };

  const json = JSON.stringify(snapshot, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  const path = process.argv[2];
  if (!path) throw new Error("Usage: tsx backupBeforeMinimumPreorder181A.ts <output-path>");
  writeFileSync(path, json, "utf8");

  const sha256 = createHash("sha256").update(json).digest("hex");
  console.log(JSON.stringify({ path, bytes: Buffer.byteLength(json, "utf8"), sha256, counts, preorderSettingsRowCount: preorderSettings.length }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
