# Database Schema Plan (Version 2, Milestone 10)

This document explains the design behind `backend/prisma/schema.prisma`
— the reasoning, not just the field list. The schema itself is the
source of truth for exact types/constraints; read this alongside it.

**Status: schema design only.** Nothing in this document or the
schema file is connected to a real database, an API route, or the
frontend. No migrations have been run.

---

## Main Models

| Model | Purpose |
|---|---|
| `Category` | Product categories (Kids Colouring Books, Bible Colouring Books, etc.) |
| `Product`, `ProductImage`, `ProductTag` | The catalogue — one product has many images and many tags |
| `Customer`, `Address` | Guest and future registered customers, and their saved addresses |
| `Order`, `OrderItem` | An order and the line items within it |
| `Payment` | One payment record per order, ready for future PayFast |
| `Shipping` | One shipping record per order, ready for future courier integration |
| `Enquiry` | Backs all four frontend demo forms (Contact, Schools, Wholesale, Distributor) |
| `AdminUser` | Placeholder only — no authentication exists yet |

Nine enums (`ProductStatus`, `OrderStatus`, `PaymentStatus`,
`PaymentMethod`, `FulfilmentStatus`, `EnquiryType`, `EnquiryStatus`,
`CustomerType`, `UserRole`) give every status/type field a fixed,
validated set of values instead of a free-text string.

---

## Why OrderItem Stores a Product Snapshot

`OrderItem` has its own `productName`, `productSlug`, `unitPrice` and
`lineTotal` fields, even though it also has an optional `productId`
relation to the live `Product` row.

**The reason:** products change. A price gets corrected, a name gets
tidied up, a product gets discontinued and removed from the catalogue
entirely. If `OrderItem` only stored a `productId` and always read the
name/price live from `Product`, every past order's receipt would
silently change whenever the product changed — or break outright if
the product were deleted. An order is a historical record of what was
actually bought and for how much; it must stay accurate forever,
independent of what happens to the catalogue afterwards.

`productId` is kept (and is nullable) purely as a convenience — e.g.
to link back to the current product page if it still exists — never
as the source of truth for what the order actually contains.

## Why Orders Store a Delivery/Customer Snapshot

The same reasoning applies to `Order` itself: it stores
`customerFirstName`, `customerLastName`, `customerEmail`,
`customerPhone`, and the full `delivery*` address fields directly,
even though it also has an optional `customerId` relation to
`Customer`.

**The reason:** if a (future) registered customer edits their saved
address or updates their phone number after placing an order, the
order must still show the address it was actually delivered to at the
time — not the customer's current details. Storing the snapshot on
the order itself guarantees that, regardless of what the customer (or
an admin) changes later on their account.

`Address` (the model) is a separate, general-purpose "saved addresses"
table for a customer's convenience at checkout — it is intentionally
**not** foreign-keyed from `Order`. An order's delivery fields are
always a copy, never a live reference.

## How Guest Checkout Is Supported

`Customer.id` is optional (`customerId String?`) on `Order`. A guest
checkout simply creates an `Order` with `customerId = null` and all
the customer/delivery fields filled in directly on the order. No
`Customer` row is required to exist.

`CustomerType` includes `GUEST` for the case where a `Customer` row
*is* created for bookkeeping purposes even without a real account
(e.g. if a future milestone chooses to group a guest's orders by
email) — but that's a future decision, not something this schema
forces either way.

## How Future Customer Accounts Will Connect

`Customer.type` moves from `GUEST` to `REGISTERED` once a real account
exists for that person. `CustomerType` also reserves `SCHOOL`,
`WHOLESALE` and `DISTRIBUTOR` values for customers who came through
one of those enquiry flows and later became recurring buyers — useful
for offering them different pricing or minimum order rules in a future
milestone, without needing a schema change to add it.

No password or credential field exists on `Customer` yet, on purpose
— see the comment directly above the model in `schema.prisma`. Version
2 does not build login; a future auth milestone must design that field
properly (a securely hashed credential, never plain text) rather than
have it bolted on speculatively here.

## How Future PayFast Will Connect

The `Payment` model already has the shape a real payment provider
needs: `method` (an enum that includes `PAYFAST`), `provider` (which
gateway handled it), `providerReference` (PayFast's own transaction/
payment ID, for reconciliation), `paidAt`, and `failureReason`. When
PayFast integration is built, it will create/update a `Payment` row
and flip `Order.paymentStatus` — no schema change should be needed for
a first version of that integration.

## How Future Courier Integration Will Connect

Same idea for `Shipping`: `courierName`, `trackingNumber`,
`trackingUrl`, `estimatedDelivery`, `shippedAt` and `deliveredAt` are
already there, ready for a courier API to populate. Until that
integration exists, `Shipping.status` (a `FulfilmentStatus`) can still
be set manually by staff, which is exactly how the current frontend's
demo order tracking already behaves conceptually — this schema just
gives that behaviour a permanent home.

## How Enquiry Forms Will Become Real

The frontend currently has four forms — Contact, Schools, Wholesale,
Distributor — that all show "this demo form does not send messages
yet" on submit (see `src/components/enquiryForm.js` in the frontend).
One `Enquiry` model backs all four: `type` (an `EnquiryType` enum)
records which form it came from, and the field set
(`companyName`, `organisationType`, `estimatedQuantity`, etc.) covers
what each of the four forms actually asks for. When a real
`/api/enquiries` endpoint exists, each form's submit handler swaps its
demo message for a real POST request — no schema redesign needed.

## What Is Not Built Yet

This milestone is schema design only. None of the following exist:

- Any API route or controller that reads/writes these models.
- Any database connection (`DATABASE_URL` is empty; no migrations
  have been run).
- Any connection from the frontend to the backend at all — the
  frontend continues to run entirely on its own static data and Local
  Storage, unaffected.
- Authentication of any kind (`AdminUser` has no password field; no
  login exists for customers or admins).
- An admin dashboard.
- Real PayFast or courier integration (the schema is *shaped* for
  them, nothing *calls* them).
- A `Review` model. `Product.ratingAverage` and `Product.reviewCount`
  exist as aggregate fields so the catalogue can display ratings once
  reviews exist, but the reviews themselves (a future `Review` model
  with `productId`/`customerId`/`rating`/`comment`) are intentionally
  out of scope for this milestone.
