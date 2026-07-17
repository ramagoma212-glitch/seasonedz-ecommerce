# Version 6 — Non-Payment Website and Operations Readiness Roadmap

Combines the four planning documents produced alongside this one
(`VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`,
`VERSION_6_PRODUCT_PAGES_AND_SEO_PLAN.md`,
`VERSION_6_EMAIL_SERVICE_PLAN.md`,
`VERSION_6_COURIER_INTEGRATION_PLAN.md`) into one proposed milestone
sequence. **Planning only — no code was changed, no email was sent, no
courier integration was added, and no payment behaviour was touched.**

## Recommended Next Milestones

- **Milestone 44 — Admin order monitoring documentation.** Complete —
  see `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`.
- **Milestone 45 — Product page and SEO planning.** Complete — see
  `VERSION_6_PRODUCT_PAGES_AND_SEO_PLAN.md`.
- **Milestone 46 — Email service planning.** Complete — see
  `VERSION_6_EMAIL_SERVICE_PLAN.md`.
- **Milestone 47 — Courier integration planning.** Complete — see
  `VERSION_6_COURIER_INTEGRATION_PLAN.md`.
- **Milestone 48 — Product page SEO implementation.** Implement the
  per-page meta description, `Product` structured data, and copy/tone
  improvements from Milestone 45's plan.
- **Milestone 49 — Email dry-run to real provider implementation.**
  Choose a provider (Resend recommended as the simplest default) and
  wire up order confirmation + admin new-order notification first, per
  Milestone 46's plan — `EMAIL_ENABLED` stays `false` until this is
  actually tested and ready.
- **Milestone 50 — Courier manual workflow improvements.** Smaller,
  lower-risk improvements to the existing manual process from
  Milestone 47's plan (e.g. clearer internal tracking-field entry
  conventions) — before any real courier API integration is attempted.

## PayFast Work Remains Paused

None of Milestones 44-50 touch payment logic, PayFast configuration,
or Render/GitHub Actions environment variables. PayFast production
enablement work (`VERSION_6_PAYFAST_PRODUCTION_ENABLEMENT_PLAN.md`,
`VERSION_6_PAYFAST_ACCOUNT_READINESS_CHECK.md`, and the still-not-
started Milestone 40 onward) remains paused until PayFast's own
account verification is approved. This roadmap is deliberately
independent of that timeline — none of it is blocked by PayFast, and
none of it should be mistaken for progress toward enabling PayFast.
