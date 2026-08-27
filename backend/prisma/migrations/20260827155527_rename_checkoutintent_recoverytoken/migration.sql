-- Version 7, Milestone 174C: CheckoutIntent's recovery token is
-- deliberately stored in plain, opaque form, not hashed — see
-- schema.prisma's own CheckoutIntent comment for the full reasoning
-- (it must remain usable when the reminder email is rendered, up to
-- hours after capture, unlike every other hashed token in this
-- schema). The table is still empty at this point in the migration
-- history (created in the immediately preceding migration within this
-- same milestone), so a straight rename is safe — no data to lose.
ALTER TABLE "CheckoutIntent" RENAME COLUMN "recoveryTokenHash" TO "recoveryToken";
ALTER INDEX "CheckoutIntent_recoveryTokenHash_key" RENAME TO "CheckoutIntent_recoveryToken_key";
