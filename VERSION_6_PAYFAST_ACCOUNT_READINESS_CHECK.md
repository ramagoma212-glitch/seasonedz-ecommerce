# Version 6 — Live PayFast Account Readiness Check (Milestone 39)

A checklist and documentation-only milestone. **No code was changed, no
`.env` file was touched, no credential was added or requested, no
payment was run, no test order was created, and nothing was deployed.**
This document tracks the account-side readiness work that only the
owner can do — verifying the PayFast business account itself — and
draws a clear line around what the developer may and may not help with.

Builds on `VERSION_6_PAYFAST_PRODUCTION_ENABLEMENT_PLAN.md`'s "PayFast
Verification Blocker" and "PayFast Account Readiness Checklist"
sections, with more operational detail on who does what.

## Current Status

- **PayFast account verification is still pending.** No live
  Merchant ID, Merchant Key, or passphrase exists yet, and none has
  been requested or shared.
- **PayFast may request the website URL** as part of its own
  verification process, to confirm what the merchant account will be
  used for.
- **The owner is handling the PayFast account and its verification
  directly** — account creation, document submission, bank account
  linking, and approval all happen on the owner's side, with PayFast
  and the owner's bank, not through this codebase or this assistant.
- **The developer must not receive bank login details, the PayFast
  account password, one-time passcodes (OTPs), or any private banking
  access, at any point, for any reason.** None of this is ever needed
  to configure the website — only the final live Merchant ID, Merchant
  Key, and (if used) passphrase are ever needed, and only after
  verification is already complete.

## Website URL

PayFast's verification process may ask for "the website URL" the
merchant account will be used for. Which URL to give depends on which
site is the actual, currently-active customer-facing website:

- **If Odoo is still the official, active customer website**, give
  PayFast the Odoo URL — that is the real site customers currently use,
  and is what PayFast should be verifying against.
- **If this custom-built site is being used for review purposes**,
  give PayFast:
  `https://ramagoma212-glitch.github.io/seasonedz-ecommerce/`
- **Never give PayFast the Render backend URL**
  (`https://seasonedz-ecommerce.onrender.com`) as "the customer
  website" — that's an API server with no customer-facing pages of its
  own; it would not make sense to PayFast's reviewers and could confuse
  the verification process.

## Owner Action Checklist

Everything below is the owner's own responsibility — account identity,
banking, and legal/verification decisions that only the account holder
can make:

- [ ] Confirm who the PayFast account holder is.
- [ ] Confirm the account type (e.g. individual/sole proprietor vs.
      registered business — whatever PayFast's own account options
      require).
- [ ] Complete PayFast's verification process (documents, identity
      checks, whatever PayFast requires).
- [ ] Confirm the correct bank account is linked for Seasonedz Group's
      own payments — never a personal or unrelated account.
- [ ] Confirm the live Merchant ID and Merchant Key are available once
      PayFast approves the account.
- [ ] Decide whether to use a live passphrase (optional on PayFast, but
      a deliberate choice either way).
- [ ] Never share the PayFast account password, bank login details,
      OTPs, or any private banking access with anyone — including the
      developer, and including this assistant.

## Developer Action Checklist

What the developer (with this assistant's help) may reasonably do, and
the firm line around what it must never do:

- Developer **may** guide the owner through what PayFast's
  verification process is asking for, in plain terms.
- Developer **may** enter the website URL into PayFast's own
  verification form, if asked to, using the correct URL per the
  section above.
- Developer **may**, later, help enter the live Merchant ID, Merchant
  Key, and passphrase directly into Render's environment variables
  **while the owner is present** — typed directly into Render's own
  dashboard, never relayed through chat, email, or any third-party
  tool first.
- Developer **must not** store live credentials in code, in a tracked
  file, or in any `.env` file committed to git.
- Developer **must not** paste credentials into ChatGPT, Claude,
  GitHub (issues, commits, PRs, comments), WhatsApp, or any other chat
  or file-sharing tool, ever, for any reason.
- Developer **must** keep PayFast disabled (`PAYFAST_ENABLED=false` /
  `VITE_PAYFAST_ENABLED=false`) until the owner has explicitly approved
  enabling it, per `VERSION_6_PAYFAST_PRODUCTION_ENABLEMENT_PLAN.md`'s
  rollout plan.

## Blockers

- PayFast account verification is still pending.
- Live credentials are not yet available, and would not be approved
  for use even if they were, until verification completes.
- There is no owner approval yet to enable live payments.

## Recommendation

**Do not enable PayFast** until:

1. PayFast verification is approved, and
2. The owner explicitly confirms every item in the "Owner Action
   Checklist" above is complete and ready.

This mirrors `VERSION_6_PAYFAST_PRODUCTION_ENABLEMENT_PLAN.md`'s own
recommendation — nothing here changes that decision, it only adds the
account-side detail needed to actually work through it.
