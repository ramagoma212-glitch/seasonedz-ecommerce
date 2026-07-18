# Version 6 — Product Database Content Sync Dry Run Result (Milestone 50)

Implements `VERSION_6_PRODUCT_DATABASE_SYNC_PLAN.md` using the accepted
low-risk option: fold the real product facts into existing text
fields only — no schema migration, no new database columns, and
`prisma/seed.ts` is not used for this (see the plan document for why
re-running `seed.ts` against production is unsafe).

**This document reports a dry run only. `--apply` was not run. The
production database was not written to.**

## Script Created

`backend/prisma/scripts/update-product-content.ts`

- Defaults to dry run (read-only); requires an explicit `--apply` flag
  to write anything.
- Scoped to exactly four products, matched by `slug` only:
  `abc-colouring-book-for-kids-with-fun-facts`,
  `mindfulness-colouring-book-for-adults`,
  `little-hands-big-faith-old-testament-bible-colouring-book`,
  `little-hands-big-faith-new-testament-bible-colouring-book`.
- Every `prisma.product.update()` call builds its `data: {}` object
  field-by-field from an explicit allow-list
  (`description`, `shortDescription`, `features`, `ageRange`) — never
  a spread of a larger object, so `price`, `stockQuantity`,
  `ratingAverage`, `reviewCount`, `images`, `slug`, `sku`, and
  `category` can never be written by this script even by a future
  editing mistake.
- `ageRange` is only ever included in an update for the two Bible
  titles (the two products whose target payload defines it); the
  other two products' `ageRange` is left untouched.
- Prints the current (forbidden-field) values of price, stock, rating
  and review count for every product purely so the operator can see
  they're unaffected — never reads them into any write payload.
- Fails safely: a missing slug is logged and skipped (does not abort
  the other three); a database connection failure aborts immediately
  with a plain error message and no writes attempted; no secret or
  connection-string value is ever printed.

npm script added (backend/package.json), since `tsx` was already a
project dependency and already used for `dev`/`seed`:

```json
"db:sync-product-content": "tsx prisma/scripts/update-product-content.ts"
```

## Dry Run Command Used

```
cd backend
npx tsx prisma/scripts/update-product-content.ts
```

(equivalently `npm run db:sync-product-content`, run without `--apply`)

## Products Found

4 / 4 — all four target slugs exist in the database and were read
successfully. No missing-slug cases occurred.

## Fields That Would Change

| Product | description | shortDescription | features | ageRange |
|---|---|---|---|---|
| ABC Colouring Book for Kids with Fun Facts | changes | changes | changes | no change (already `3-8 years`) |
| Mindfulness Colouring Book for Adults | changes | changes | changes | no change (already `16+ years`) |
| Little Hands Big Faith Old Testament | changes | changes | changes | changes: `4-10 years` → `6-10 years` |
| Little Hands Big Faith New Testament | changes | changes | changes | changes: `4-10 years` → `6-10 years` |

Every old-value string printed by the dry run matched
`backend/prisma/product-content-backup-2026-07-18.json` exactly, and
every new-value string matched
`backend/prisma/product-content-update-plan.md` exactly — confirming
both the backup taken in Milestone 49 and the plan document are still
accurate against the live database.

## Forbidden Fields Confirmed Untouched

The dry run printed each product's current `price`, `stockQuantity`,
`ratingAverage`, and `reviewCount` for visibility only:

| Product | price | stockQuantity | ratingAverage | reviewCount |
|---|---|---|---|---|
| ABC Colouring Book | 149 | 50 | 4.8 | 36 |
| Mindfulness Colouring Book | 159 | 48 | 4.7 | 52 |
| Old Testament | 169 | 50 | 4.9 | 41 |
| New Testament | 169 | 1 | 4.9 | 18 |

None of these values appear anywhere in the script's update payload
construction — confirmed by code inspection (the `data: {}` object is
built only from the four allowed fields) and by re-checking the live
`GET /api/products/abc-colouring-book-for-kids-with-fun-facts`
response immediately after the dry run, which still returned the
unchanged, pre-Milestone-48 `shortDescription`.

`images`, `slug`, `sku`, and `category` were not read into the update
payload at all, and are not printed by the script either.

## Production Database Not Updated

Confirmed. The dry run performed only `prisma.product.findUnique()`
reads. `--apply` was not passed, so the script's own `if (apply)`
branch that calls `prisma.product.update()` never executed. Re-checked
live via the public API after the run: `shortDescription` for the ABC
product is still the original seed-era text, unchanged.

## Next Step Requires Approval

This milestone stops here, per instruction. Running
`npm run db:sync-product-content -- --apply` (or
`npx tsx prisma/scripts/update-product-content.ts --apply`) against
the production database is the next step, and requires explicit
approval before it is run.
