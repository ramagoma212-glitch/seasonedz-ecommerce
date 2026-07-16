# Version 4 — PayFast Sandbox Public Tunnel Setup (Milestone 28)

**Setup, documentation, and preflight only.** This guide prepares
everything needed for a real hosted PayFast sandbox round trip — it
does **not** perform that round trip. The actual hosted payment test
is Milestone 30. Following this guide should not enable PayFast in
production, change any Render environment variable, or send a real
payment anywhere.

Every URL below uses a placeholder —
`https://your-tunnel-url.example` — because a real tunnel URL is
generated fresh each time you start one and is different every
session. Replace it with whatever your own tunnel tool prints when you
run it.

## Before You Start

- A PayFast **sandbox** merchant account, with its merchant ID,
  merchant key, and (if configured) passphrase already in your local,
  git-ignored `backend/.env`. If these aren't there yet, add them to
  `backend/.env` only — never to `backend/.env.example`, never to root
  `.env`, and never commit them.
- A tunnel tool installed (e.g. [ngrok](https://ngrok.com/) — free tier
  is enough; any tool that gives you a temporary public HTTPS URL
  forwarding to a local port works the same way, e.g. Cloudflare Tunnel
  or localtunnel).

## Step 1 — Open a Temporary Public Tunnel to the Backend

Start the tunnel **before** starting the backend isn't required, but
the backend does need to already be running (or start right after) on
port `5000`, since the tunnel just forwards traffic to that port —
order between "start backend" and "start tunnel" doesn't matter as
long as both end up running together.

Using ngrok as the example:

```bash
ngrok http 5000
```

ngrok will print something like:

```
Forwarding    https://abcd1234.ngrok-free.app -> http://localhost:5000
```

That `https://abcd1234.ngrok-free.app` line **is** your
`https://your-tunnel-url.example` for everything below. Copy it
exactly — it's different every time you start a new tunnel session.

**Confirm the tunnel forwards to `http://localhost:5000`** (not some
other port) — this is exactly what the command above does; if your
backend runs on a different port locally, adjust the tunnel command to
match, not the other way around.

## Step 2 — Set `backend/.env` Safely

Open `backend/.env` (never `backend/.env.example`) and set:

```
PAYFAST_ENABLED=true
PAYFAST_MODE=sandbox
BACKEND_PUBLIC_URL=https://your-tunnel-url.example
PAYFAST_NOTIFY_URL=https://your-tunnel-url.example/api/payments/payfast/notify
PAYFAST_RETURN_URL="http://localhost:5173/#/payment-success"
PAYFAST_CANCEL_URL="http://localhost:5173/#/payment-cancelled"
```

`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and (if your account
uses one) `PAYFAST_PASSPHRASE` should already be set from your sandbox
account — leave them as they are.

**For the actual Milestone 30 hosted round trip** (not required just
to reach this point), also set the source verification hardening from
Milestone 29 — see `VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`:

```
PAYFAST_VERIFY_SOURCE=true
PAYFAST_VALIDATE_SERVER=true
TRUST_PROXY=true
```

`TRUST_PROXY=true` is what lets `req.ip` reflect the real caller behind
your tunnel rather than the tunnel's own address — without it,
`PAYFAST_VERIFY_SOURCE` has no chance of seeing PayFast's real source
IP. Leave all three `false` (the default) if you're only working
through Steps 1-11 below without yet attempting a real hosted payment.

**Important — quote any value containing `#`.** `dotenv` treats an
unquoted `#` as the start of a comment and silently truncates
everything after it. `PAYFAST_RETURN_URL`/`PAYFAST_CANCEL_URL` contain
`#` (this frontend uses a hash-based router) and **must** be wrapped in
double quotes exactly as shown above, or only
`http://localhost:5173/` will survive and the `#/payment-success` part
will silently vanish. (This exact mistake was made and caught during
Milestone 21 — see `backend/PAYFAST_SETUP.md`'s reminder about it.)

**`BACKEND_PUBLIC_URL`/`PAYFAST_NOTIFY_URL` use the tunnel URL — they
are the only two values that need to change from your everyday local
setup.** `PAYFAST_RETURN_URL`/`PAYFAST_CANCEL_URL` stay pointed at
`localhost:5173`, never the tunnel — see "Why Return/Cancel URLs Stay
Local" below.

## Step 3 — Set Root `.env` Safely

Open the root `.env` (not `backend/.env`, not any `.example` file) and
set:

```
VITE_API_BASE_URL=http://localhost:5000/api
VITE_PAYFAST_ENABLED=true
```

`VITE_API_BASE_URL` stays `localhost` — the frontend you're testing
with runs on your own machine and talks to your own local backend
directly; only PayFast's own servers need the tunnel address (to reach
your `notify_url` from the outside), not your browser.

## Step 4 — Start the Backend

```bash
cd backend
npm run dev
```

Confirm it starts cleanly (no missing-env-var errors) — since
`PAYFAST_ENABLED=true`, the backend will now eagerly require
`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `BACKEND_PUBLIC_URL`,
`PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`, and `PAYFAST_NOTIFY_URL` to
all be set (see `backend/src/config/env.ts`) — if any are missing, it
will fail to start and name exactly which one, never printing values.

## Step 5 — Start the Frontend

```bash
npm run dev
```

Visit `http://localhost:5173` and confirm the PayFast option is now
selectable at checkout (not "Coming Soon") — this confirms
`VITE_PAYFAST_ENABLED=true` was picked up.

## Step 6 — Create a PayFast Checkout Order Locally

Add an item to the cart, go to checkout, fill in the form, select
PayFast, and submit. This creates a real order
(`paymentMethod: PAYFAST`, `paymentStatus: PENDING`) via the existing
Order API — nothing new here, same as any earlier PayFast testing.

## Step 7 — Check `/initiate` Returns the Sandbox `processUrl` and Fields

Either let the checkout flow do this automatically (it calls
`POST /api/payments/payfast/initiate` itself), or call it directly to
inspect the response:

```bash
curl -s -X POST http://localhost:5000/api/payments/payfast/initiate \
  -H "Content-Type: application/json" \
  -d '{"orderNumber":"SG-2026-XXXX"}'
```

Confirm:
- `data.processUrl` is `https://sandbox.payfast.co.za/eng/process`
  (not the production PayFast URL).
- `data.fields.notify_url` is your tunnel URL +
  `/api/payments/payfast/notify`.
- `data.fields.return_url`/`cancel_url` are `localhost:5173` URLs
  (with `#/payment-success`/`#/payment-cancelled` intact — confirming
  the quoting in Step 2 worked).
- `data.fields.signature` is present.

## Step 8 — Confirm `notify_url` Points to the Public Tunnel

Already checked in Step 7's `data.fields.notify_url` — this is the URL
PayFast's own servers will call, server-to-server, once a real hosted
payment happens in Milestone 30. It must be the tunnel URL; a
`localhost` value here would mean PayFast could never reach it (see
"Why Localhost Cannot Work" below).

## Step 9 — Confirm Return/Cancel URLs Point to Localhost

Already checked in Step 7's `data.fields.return_url`/`cancel_url` —
these should stay `localhost:5173`, not the tunnel. See below for why
this is correct, not an oversight.

## Step 10 — Confirm No Production Render Env Was Changed

This entire guide only ever edits your local `backend/.env` and root
`.env` — both git-ignored, both never touching Render. To be sure:

```bash
git status
```

should show a clean working tree (or only unrelated changes) — no
`.env` file ever appears here, since both are git-ignored. Render's
dashboard is a separate system entirely; nothing in this guide opens
it, logs into it, or references changing it. If you want to be extra
sure, simply don't open Render's dashboard while following this guide.

## Step 11 — Confirm No Secrets Are Printed

None of the commands above print `PAYFAST_MERCHANT_KEY` or
`PAYFAST_PASSPHRASE` directly — the `/initiate` response in Step 7
*does* include `merchant_id` and `merchant_key` in its `fields` (PayFast
requires these as visible form fields; they're not treated as secret
in that sense — see `backend/PAYFAST_SETUP.md`), but never the
passphrase, and backend startup logs never print any environment
variable's value, only names of any that are missing.

## Why Return/Cancel URLs Stay Local

`return_url`/`cancel_url` are **browser redirects** — PayFast tells the
*customer's own browser* to navigate there. Since you (the tester) are
completing this payment in your own browser, on your own machine,
`http://localhost:5173/#/payment-success` genuinely works: your browser
can reach your own machine's dev server just fine. This is different
from `notify_url`, which PayFast's servers call directly — see below.

## Why a `localhost` Notify URL Does Not Work

`notify_url` is called **server-to-server, by PayFast's own
infrastructure** — not by your browser. PayFast's servers, running
somewhere on the public internet, have no route to
`http://localhost:5000` on your machine; that address means "this
machine" only to the machine itself, and is meaningless and
unreachable from anywhere else. This isn't a bug to fix — it's what
"localhost" means. A public tunnel exists specifically to give
PayFast's servers a real, internet-routable address that forwards back
to your local machine.

## Why Production Render Should Not Be Used for This

Using the live Render backend for this test would require setting
`PAYFAST_ENABLED=true` directly on Render — explicitly forbidden for
this milestone, and risky beyond it: it would make the **live**
backend accept real `PAYFAST` orders from **any** real site visitor,
not just the tester, regardless of what the frontend shows (a
determined visitor can POST to the API directly without using the UI
at all). The tunnel approach keeps `PAYFAST_ENABLED=true` confined
entirely to your own machine — the live site and its real visitors are
completely unaffected the whole time.

## Known Risks

- **Shared production database.** Local dev and the live Render
  backend read the same Supabase database — there is no separate
  "dev" database. Every test order/enquiry created while following
  this guide is a real row in the same database real customers' orders
  live in. Clean up by precise order number, same discipline as every
  previous QA/testing milestone.
- **Tunnel URLs are temporary.** A free-tier tunnel URL is usually
  different every time you start a new session — `BACKEND_PUBLIC_URL`/
  `PAYFAST_NOTIFY_URL` need updating (and the backend restarted) each
  time, not set once and forgotten.
- **Forgetting to roll back.** Leaving `PAYFAST_ENABLED=true` and a
  tunnel running after testing doesn't affect production, but does
  leave your local machine in a non-default state that could confuse a
  future session — see the Rollback Checklist below.

---

## Preflight Checklist (Before Any Hosted Sandbox Payment)

Work through this before Milestone 30's actual hosted payment attempt:

- [ ] Backend running locally (`http://localhost:5000`).
- [ ] Frontend running locally (`http://localhost:5173`).
- [ ] Tunnel is running.
- [ ] Tunnel forwards to `localhost:5000`.
- [ ] `backend/.env` has `PAYFAST_ENABLED=true`.
- [ ] `backend/.env` has `PAYFAST_MODE=sandbox`.
- [ ] `backend/.env` has `PAYFAST_NOTIFY_URL` using the tunnel URL.
- [ ] Root `.env` has `VITE_PAYFAST_ENABLED=true`.
- [ ] Root `.env` has `VITE_API_BASE_URL=http://localhost:5000/api`.
- [ ] `backend/.env` has `PAYFAST_VERIFY_SOURCE=true` (Milestone 29
      hardening — see `VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`).
- [ ] `backend/.env` has `PAYFAST_VALIDATE_SERVER=true` (Milestone 29
      hardening).
- [ ] `backend/.env` has `TRUST_PROXY=true` — without this, `req.ip`
      reflects the tunnel's own address rather than PayFast's real
      source IP, and `PAYFAST_VERIFY_SOURCE` cannot possibly pass no
      matter how correct the request actually is.
- [ ] Order creation works (a normal bank-transfer or PayFast order can
      be created via the API).
- [ ] PayFast initiation works (`/initiate` returns a sandbox
      `processUrl` + fields, per Step 7 above).
- [ ] PayFast form submits to sandbox (the frontend's hidden form
      actually navigates to `sandbox.payfast.co.za` — confirmed by
      reaching PayFast's real page, not by inspecting the request only).
- [ ] No test order is left behind — unless deliberately kept for
      Milestone 30 to reuse (in which case, note its order number
      somewhere so it's cleaned up deliberately afterward, not
      forgotten).

## Rollback Checklist (Returning to Safe Local Mode)

Work through this once a testing session ends:

- [ ] Set `backend/.env`'s `PAYFAST_ENABLED=false` (or remove the line
      entirely — both are equally safe, since `false` is the default).
- [ ] Set root `.env`'s `VITE_PAYFAST_ENABLED=false`.
- [ ] Set `backend/.env`'s `PAYFAST_VERIFY_SOURCE=false`,
      `PAYFAST_VALIDATE_SERVER=false`, and `TRUST_PROXY=false` (or
      remove the lines entirely — all three default to `false`).
- [ ] Stop the tunnel process.
- [ ] Clean up any test orders/enquiries created during the session,
      by precise order number/ID — restore stock for any deleted
      orders.
- [ ] Confirm Supabase's order/enquiry counts match what they should
      be before moving on.
- [ ] **Do not touch Render** — there is nothing to roll back there,
      since nothing in this guide ever changes it. If you're ever
      unsure, `git status` plus not having opened Render's dashboard is
      confirmation enough that it wasn't touched.

## Code Review Result: No Code Changes Needed

Reviewed for this milestone: `backend/src/config/payfast.ts`,
`backend/src/services/payfast.service.ts`,
`src/pages/checkoutPage.js`, `src/pages/paymentSuccess.js`,
`src/pages/paymentCancelled.js`. **Confirmed: no code changes are
required to support a tunnel `notify_url`.**

- `payfastConfig.notifyUrl`/`returnUrl`/`cancelUrl` are all read purely
  from environment variables (`config/env.ts` → `config/payfast.ts`) —
  nothing is hardcoded to `localhost` or any other fixed value
  anywhere in the backend.
- The `/notify` route itself doesn't inspect or care what URL was used
  to reach it — a request arriving via a tunnel (forwarded to
  `localhost:5000`) is indistinguishable from one that arrived
  directly. Only the *configured* `notify_url` (what we tell PayFast to
  call) needs to change, which is an env var edit, not a code change.
- The frontend's checkout/payment pages call the backend only through
  `VITE_API_BASE_URL` (via `apiClient.js`) — no hardcoded URLs anywhere
  in the three files reviewed (confirmed by search).

If a future review ever finds a genuine reason a code change is
needed for tunnel compatibility, that reason should be documented
explicitly and confirmed with you before making it — not assumed.
