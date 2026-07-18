# Version 6 — Contact and Enquiry Conversion Improvements Result (Milestone 55)

Improves the Contact, Schools, Wholesale and Distributor pages so
customers know what to ask, how to reach Seasonedz Group, and what
response to expect. **No form submission logic, backend enquiry
route, validation, database schema, email sending logic, or payment
logic was changed.**

## What Was Reviewed

- `src/pages/contact.js`, `src/pages/schools.js`,
  `src/pages/wholesale.js`, `src/pages/distributor.js` — the four
  enquiry pages.
- `src/components/enquiryForm.js` — the shared form component all four
  pages use (name, organisation, email, optional quantity, message).
  Confirmed it has no dedicated phone/WhatsApp field, so "what to
  include" guidance tells customers to mention a WhatsApp number
  inside their message if that's their preferred contact method,
  rather than implying a form field that doesn't exist.
- `src/components/footer.js` — real Email/WhatsApp/Phone links,
  confirmed already correct (Milestone 53.5's contact details update).
- `src/data/faqs.js` — existing Support/School Orders/Wholesale/
  Delivery FAQ entries.
- `src/pages/home.js` — the Schools/Wholesale banner, confirmed already
  accurate (Milestone 52) and not touched.
- `backend/src/controllers/enquiry.controller.ts`,
  `backend/src/routes/enquiry.routes.ts`,
  `backend/src/services/enquiry.service.ts`,
  `backend/src/validators/enquiry.validator.ts` — reviewed for
  awareness only. Confirmed straightforward validate/create/status
  flow, unrelated to and unchanged by this milestone.

## Pages Improved

`src/pages/contact.js`, `src/pages/schools.js`,
`src/pages/wholesale.js`, `src/pages/distributor.js`,
`src/data/faqs.js`.

## Contact Page Improvements

Added two new sections above the existing contact details/form:

- **How We Can Help** — six clear categories (general product
  questions, order support, delivery support, school orders,
  wholesale and bulk enquiries, distributor interest), each linking
  to the relevant dedicated page (Shipping Policy, Schools, Wholesale,
  Distributor) where one exists.
- **What to Include** — name, best way to reach you (email or
  WhatsApp number), product or order question, quantity needed for
  bulk or school orders, and delivery area if relevant.

## Schools Page Improvements

- Expanded "Who We Work With" to explicitly include church groups,
  Sunday school programmes, and kids programmes and holiday clubs
  (previously only preschools, primary schools, teachers, aftercare
  and tutoring centres).
- Widened the bulk orders and "Built for the Classroom" wording to
  explicitly mention kids programmes, faith based activities and
  educational gifts.
- Added "using the form below or WhatsApp" to the "Let's Talk" section
  so customers know they can reach out either way.
- No discount amount is stated or implied beyond the existing "happy
  to discuss bulk pricing" framing. No approval, partnership, or
  testimonial claim was added or existed already.

## Wholesale Page Improvements

- Expanded "Who We Welcome Enquiries From" to explicitly include
  retailers and resellers, gift shops, and bulk buyers (previously
  bookshops, educational/toy stores, church shops, stationery stores,
  market sellers, corporate gifting buyers).
- Added a new "What to Include in Your Enquiry" section: business
  name, location, products of interest, estimated quantity, preferred
  contact method.
- No wholesale pricing was invented anywhere. No automatic approval is
  promised. The existing "we don't publish a fixed price list...
  we'll follow up with a custom quote" framing is unchanged.

## Distributor Page Improvements

- Added a new "What to Include in Your Enquiry" section: company
  name, region or distribution area, current distribution network or
  experience, preferred contact method.
- The existing "Applications Reviewed Manually" notice (every
  enquiry reviewed personally, no automated approval process) already
  correctly avoided promising acceptance — unchanged, since it already
  satisfied this milestone's requirement.
- The existing contact support note (Email/WhatsApp) was already in
  place from the public contact details update; unchanged here.

## FAQ Improvements

Added one new entry under a new **Distributor** category: "How do I
enquire about becoming a distributor?" — points to the Distributor
page and restates the honest "reviewed personally, no automated
approval" framing. The existing Support, School Orders, Wholesale, and
Delivery (four entries from Milestone 54) FAQ content already covered
"how to contact Seasonedz Group," "school orders," "wholesale or bulk
orders," "order support" (via the Support entry), and "delivery
support" — reviewed and confirmed still accurate, not duplicated.

## Form Safety Result

`src/components/enquiryForm.js` was not modified. No field name,
`type` value, validation attribute, or submission wiring changed on
any of the four pages — every `renderEnquiryForm({...})` call site is
untouched; only the surrounding page content (headings, paragraphs,
lists) changed.

## Backend Enquiry Safety Result

No file under `backend/src/controllers/`, `backend/src/routes/`,
`backend/src/services/`, or `backend/src/validators/` was touched.
Confirmed via diff.

## Checkout and Payment Safety Result

No file under `backend/src/services/payfast.service.ts`,
`src/js/orders.js`, `src/pages/checkoutPage.js`, or any payment/
checkout path was touched. Confirmed via diff — this milestone's
changes are scoped entirely to the four enquiry pages and the FAQ
data file.

## Testing Result

Ran the frontend locally (`npm run dev`) and checked every changed
page in a real browser (Playwright), without submitting any form (per
instruction, to avoid creating real backend enquiry data):

| Check | Result |
|---|---|
| Contact page: "How We Can Help" and "What to Include" sections render, links to Shipping/Schools/Wholesale/Distributor pages work | Passed |
| Schools page: expanded "Who We Work With" list renders, WhatsApp mention present | Passed |
| Wholesale page: expanded audience list and new "What to Include" section render | Passed |
| Distributor page: new "What to Include" section renders alongside the existing manual review notice | Passed |
| FAQ: new Distributor entry renders | Passed |
| Forms still render correctly on all four pages (name/organisation/email/quantity/message fields, submit button) | Passed |
| Email link (`mailto:Nedzamb1a@gmail.com`) and WhatsApp link (`https://wa.me/27728445644`) present and correct on Contact page and via the shared contact support note | Passed |
| PayFast radio still `disabled`, label still "PayFast (Coming Soon)" | Passed |
| Bank Transfer radio still selectable, not disabled | Passed |
| Console errors | Only the standard, expected "backend not running locally" connection-refused warnings, harmless and unrelated to this milestone |
| Backend `npm run build` | Passed |
| Backend `npm run lint` | Passed |
| Frontend `npm run build` | Passed |

## Recommended Next Step

None of the four enquiry forms currently trigger any email (customer
acknowledgement or admin notification) — per
`VERSION_6_EMAIL_SERVICE_PLAN.md` and `VERSION_6_EMAIL_DRY_RUN_IMPLEMENTATION_RESULT.md`,
wiring `sendEnquiryReceivedEmail`/`sendAdminNewEnquiryEmail` into
`enquiry.controller.ts`'s `createEnquiryHandler` remains a deliberately
separate future milestone, once a real email provider decision has
been made. This milestone's content improvements stand on their own
regardless of that decision.
