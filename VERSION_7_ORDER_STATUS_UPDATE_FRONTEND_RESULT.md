# Version 7, Milestone 64: Order Status Update Frontend — Result

**Frontend admin implementation plus one minimal backend read-only route. No successful status update was submitted during this milestone's testing. No production order, payment, product, or customer data was changed beyond what Milestone 63's already-approved test had already set.**

Implements the UI planned in `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md` and `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md`, against the `PATCH /api/admin/orders/:orderNumber/status` route from `VERSION_7_ORDER_STATUS_UPDATE_BACKEND_RESULT.md` (Milestone 63, live and already proven with one approved test).

## What Was Implemented

The admin order detail page (`/admin/orders/:orderNumber`) now shows a status-update control (buttons for valid next statuses, a confirmation step with a required-for-cancellation note, and a payment-safety note) and a read-only audit history timeline, sourced from a new minimal admin-only backend route.

## Frontend Pages/Components Changed

- `src/pages/adminOrderDetail.js` — rewritten to add `renderStatusUpdateSection()` and `renderStatusHistoryTimeline()`, fetch status history alongside the order (`Promise.all`), and consume a one-shot success message after a status change.
- `src/js/app.js` — added `setupAdminOrderStatusForm()` and its handlers (`handleAdminSelectNextStatus`, `handleAdminCancelStatusSelection`, `updateAdminStatusNoteCount`, `handleAdminStatusUpdateSubmit`), following the same delegated-listener pattern already used for every other form on this site.
- `src/js/adminGuard.js` — added `setPendingAdminMessage()`/`consumePendingAdminMessage()`, a tiny cross-render message handoff (app.js sets it right before `rerenderCurrentRoute()`; the page reads and clears it on its next render).
- `src/js/api/adminDashboardApi.js` — added `getAdminOrderStatusHistory()` and `updateAdminOrderStatus()` (the only write call in this file — every other function remains a `GET`).
- `src/css/pages.css` — new styles for the status-update control and the timeline, plus a mobile breakpoint stacking the option/action buttons below 480px.
- `src/css/components.css` — added `.form-banner--success` (didn't exist before; matches the existing `.form-banner--error` shape with success colours).

## Backend Read-Only Route Added

**Yes — `GET /api/admin/orders/:orderNumber/status-history`.** The existing admin order-detail response (`getOrderByNumber()` in `order.service.ts`) is shared with the *public, unauthenticated* customer-facing order lookup — adding admin-only audit data there would have leaked it to any customer who knows an order number, exactly the risk flagged and deferred in Milestone 63's result document. This new route is the resolution: entirely separate, admin-only, and never touches the shared function.

- `backend/src/services/adminOrderStatus.service.ts` — added `getOrderStatusHistory(orderNumber)`, a read-only query with a `select` that only ever returns `oldStatus`, `newStatus`, `note`, `source`, `createdAt`, `changedByAdminNameSnapshot`, `changedByAdminEmailSnapshot` — no `passwordHash`, `tokenHash`, payment secret, or raw payment payload is selectable from this query at all.
- `backend/src/controllers/adminOrderStatus.controller.ts` — added `getOrderStatusHistoryHandler`.
- `backend/src/routes/adminDashboard.routes.ts` — added `router.get("/orders/:orderNumber/status-history", getOrderStatusHistoryHandler)`, inheriting `requireAdminAuth` from the same router-level guard every other route here already uses.
- **No data is ever changed by this route** — confirmed by code review: it contains no `.create(`/`.update(`/`.delete(` call anywhere.
- **The public customer order tracking endpoint (`order.controller.ts`, `order.service.ts`) was not modified at all.**

## How Valid Next Statuses Are Shown

A client-side `ALLOWED_NEXT_STATUSES` table (in `adminOrderDetail.js`) mirrors the backend's transition table exactly, and is used purely to decide which buttons to render — never to bypass server-side validation, which independently re-checks every transition regardless of what the UI sends. If the current status has no valid next statuses (`DELIVERED`, `CANCELLED`, or `REFUNDED`, which is never reachable via this workflow), the page shows: *"This order is final. No further status updates are available."* and renders no buttons at all.

## Cancellation Note Rule

The note textarea is always optional except when `CANCELLED` is the selected next status, in which case: the "(required for cancellation)" hint becomes visible, a dedicated cancellation warning banner appears (*"Confirm cancellation carefully. This does not refund payment and does not send an email automatically."*), and the client blocks submission with an inline error if the trimmed note is empty — mirroring, not replacing, the backend's own independent enforcement of the same rule. The textarea has `maxlength="500"` and a live remaining-character counter; the value is trimmed before being sent.

## Confirmation Behaviour

Clicking a "Move to X" button reveals (never auto-submits) a confirmation form showing: *"Confirm that you want to change this order from CURRENT_STATUS to NEW_STATUS."* — plain-language status names via the existing `humanizeEnum()` helper. A separate "Cancel" button on the confirmation form hides it again without submitting anything. No note or status value is sent to the backend until "Confirm Change" is explicitly clicked.

## Audit Timeline Behaviour

A reverse-chronological list, each entry showing: old→new status badges (reusing the existing `renderStatusBadge()` component), date/time, the admin's name and email (from the snapshot fields — accurate even if that admin account is later deleted, per the audit model's own design), the source (currently always "Admin Dashboard"), and the note if present — all rendered as escaped plain text (`escapeHtml()`), never interpreted as HTML. If an order has no history yet, the timeline shows: *"No status history recorded yet."* — never a fabricated entry, matching `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md` Section 12.

## Payment Safety Wording

A fixed note — *"Order status updates do not change payment status, payment records or refunds."* — appears directly below the status-update control (or below the "final" message, when applicable), always visible whenever this section renders.

## Testing Completed

| Check | Result |
|---|---|
| Backend `npm run build` (`prisma generate && tsc`) | Pass |
| Backend `npm run lint` (`tsc --noEmit`) | Pass |
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| `npx prisma migrate status` | "Database schema is up to date!" — no schema change in this milestone |
| Frontend `npm run build` | Pass |
| Unauthenticated `GET /api/admin/orders/:orderNumber/status-history` | `401` |
| Unauthenticated `PATCH /api/admin/orders/:orderNumber/status` (regression) | `401` |
| Unauthenticated `GET /api/admin/orders/:orderNumber` (regression) | `401` |
| Unauthenticated `#/admin/orders/:orderNumber` frontend page | Redirects to `#/admin/login` |
| Non-mutating authenticated UI check on `SG-2026-4DX9` (owner-performed, in browser) | Confirmed: "This order is final. No further status updates are available." shown, no buttons present; Status History timeline correctly shows one entry — `Pending → Cancelled`, `19 Jul 2026, 13:17`, "Admin (ramagoma212@gmail.com)", "Admin Dashboard" source, and the exact Milestone 63 test note text |
| Production data before vs. after all testing | Identical — all 3 orders' `status`/`paymentStatus` unchanged, `OrderStatusHistory` row count still 1, `Product`/`Payment`/`Enquiry` counts unchanged |
| `AdminSession` after testing | Cleared to 0 (one leftover login session from the visual check, cleared the same way as prior milestones) |

## Why No Successful Authenticated Mutation Test Was Run Yet

This milestone's task explicitly limited testing to non-mutating checks: *"Do not run a successful authenticated status update yet unless separately approved."* `SG-2026-4DX9` is already `CANCELLED` (final, from the approved Milestone 63 test) and therefore has no valid next status to attempt regardless — the only orders left that could actually receive a submitted status change are `SG-2026-28SM` and `SG-2026-UM3Y`, both explicitly protected from being touched this milestone (*"Do not change SG-2026-28SM or SG-2026-UM3Y during implementation without separate approval"*). The visual check instead confirmed every piece of the read path (final-state message, payment-safety note, audit timeline rendering the real Milestone 63 data correctly) without needing to submit anything. A first successful end-to-end submit-and-confirm test through the UI (on a deliberately chosen, explicitly approved order) should be its own separate, explicitly-approved next step — the same discipline already used for Milestone 63's backend test.

## Next Milestone Recommendation

Once the owner explicitly approves a first real UI-driven status update (choosing which order and which transition, same approval shape as Milestone 63's test), that confirms the full stack end-to-end. After that: Milestone 65 — admin enquiries management (status updates for `Enquiry`, reusing this same plan → backend → frontend phased discipline), per `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md`'s original milestone sequence.
