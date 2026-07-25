# Domain Connection Plan: www.seasonedzgroup.co.za

**Planning only. The domain is not connected yet. No DNS was changed, no GitHub Pages custom domain setting was touched, and no Render environment variable was changed.** This document is the step-by-step plan for when the owner is ready to actually connect the domain.

## Current Live URLs

- Frontend (GitHub Pages): `https://ramagoma212-glitch.github.io/seasonedz-ecommerce/`
- Backend (Render): `https://seasonedz-ecommerce.onrender.com`

## Target Domain

- Main website: `https://www.seasonedzgroup.co.za`
- Root/apex domain `seasonedzgroup.co.za` should redirect to the `www` version above.
- The backend's own URL does not change — Render's `onrender.com` address stays exactly as it is. Only the frontend moves to the new domain.

## What Was Found in This Review

### Vite base path — change required, but must wait until cutover

`vite.config.js` currently sets `base: "/seasonedz-ecommerce/"`, because the site is served today as a GitHub Pages *project* site under that sub-path. Once the site is served from the root of `www.seasonedzgroup.co.za`, this must change to `base: "/"` (or the line removed entirely, since `"/"` is Vite's own default) — otherwise every built asset (JS, CSS, images) would still be requested from a `/seasonedz-ecommerce/...` path that will no longer exist at the new domain.

**This change was deliberately not made in this milestone.** If it were merged and deployed today, it would immediately break the *current* live site — GitHub Pages is still serving from the `/seasonedz-ecommerce/` sub-path until the custom domain is actually connected, so switching `base` to `/` now would make every asset URL 404 on the site as it exists today. This change must be made and deployed **at the same time** as the actual domain cutover (see "GitHub Pages Steps" below), not before.

### CNAME file — needs to be added, also at cutover time

No `CNAME` file exists anywhere in this repository today. Since this project builds with Vite and copies everything in `public/` straight into the deployed `dist/` output (confirmed already true for the static product images), the safe approach is to add a `public/CNAME` file containing exactly:

```
www.seasonedzgroup.co.za
```

This ensures the custom domain setting is baked into every future deployment automatically, rather than relying only on a setting stored in the GitHub repository UI (which is also configured separately — see "GitHub Pages Steps" below, both need to happen together).

**This file was deliberately not added in this milestone either.** Adding it now, before DNS actually points anywhere, risks GitHub Pages treating the repository as having a custom domain configured while that domain isn't ready yet, which could show as a broken/unverified domain state and cause confusion. It should be added in the same change as the `vite.config.js` base path fix, right when the owner is ready to actually connect the domain.

### Router and internal links — no change needed

This site uses a **hash-based router** (`src/js/router.js`) — every internal link and route is of the form `#/shop`, `#/product/...`, `#/admin/products`, and so on. The router only ever reads `window.location.hash`, never the domain or path in front of the `#`. This means every internal link, every page route, and the whole admin area will keep working exactly as they do today, on any domain, with **zero code changes needed** for routing itself.

### Image and asset paths — fixed automatically by the Vite base path change

`src/js/paths.js`'s `withBase()` helper (already fixed in Milestone 69 to also pass through absolute Supabase Storage URLs unchanged) resolves every relative asset path against `import.meta.env.BASE_URL`, which is set by the `vite.config.js` `base` value. Once that one value changes from `/seasonedz-ecommerce/` to `/`, every relative image and asset path across the whole site resolves correctly at the new domain automatically — no other file needs to change.

### API base URL — already domain-independent, no change needed

The frontend's `VITE_API_BASE_URL` is already hardcoded to the Render backend's own URL (`https://seasonedz-ecommerce.onrender.com/api`) in `.github/workflows/*.yml` — it has nothing to do with which domain the frontend itself is served from. No change needed here at all.

### Backend CORS — code change made now, safely, in this milestone

`backend/src/config/env.ts` builds its list of browser origins allowed to call the API (`allowedOrigins`) from `FRONTEND_URL` plus one optional `FRONTEND_PRODUCTION_URL`. As written before this milestone, `FRONTEND_PRODUCTION_URL` only ever supported **a single** additional origin — but the domain cutover needs **three** origins allowed at once for a transition period:

1. `https://ramagoma212-glitch.github.io` (the current GitHub Pages origin — kept working during the transition; note this is the same *origin* whether or not `/seasonedz-ecommerce` is in the path, since a browser's `Origin` header is only ever scheme+host+port, never a path)
2. `https://www.seasonedzgroup.co.za` (the new main site)
3. `https://seasonedzgroup.co.za` (the apex/redirect domain)

**Fix made in this milestone:** `FRONTEND_PRODUCTION_URL` now accepts a comma-separated list of origins (e.g. `https://a.example,https://b.example`), fully backward compatible with today's single-value setup — verified directly: a single value with no comma produces the exact same result as before this change, and a comma-separated value correctly splits into multiple allowed origins. This change is safe to ship now because **it does not change any current behaviour** — the actual Render environment variable value is not being changed in this milestone, only the code's ability to handle a comma-separated value whenever the owner later updates it. This removes one thing that would otherwise need to be coded and deployed under time pressure at the exact moment of the real cutover.

## DNS Records the Owner Must Add (Not Applied Yet)

At the domain registrar/DNS provider for `seasonedzgroup.co.za`, using GitHub's current official guidance for a custom domain on GitHub Pages:

### `www` subdomain record

| Type | Host/Name | Value |
|---|---|---|
| CNAME | `www` | `ramagoma212-glitch.github.io` |

### Root/apex domain records (`seasonedzgroup.co.za` with no subdomain)

A CNAME record cannot normally be used on a root/apex domain (this is a general DNS rule, not specific to GitHub). GitHub's current guidance for apex domains is to add **A records** pointing at GitHub Pages' IP addresses:

| Type | Host/Name | Value |
|---|---|---|
| A | `@` (or blank/root, depending on the provider) | `185.199.108.153` |
| A | `@` (or blank/root, depending on the provider) | `185.199.109.153` |
| A | `@` (or blank/root, depending on the provider) | `185.199.110.153` |
| A | `@` (or blank/root, depending on the provider) | `185.199.111.153` |

Optionally, for IPv6 support, GitHub also publishes AAAA records for the same purpose:

| Type | Host/Name | Value |
|---|---|---|
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

**Important — verify against GitHub's own current documentation before adding these.** DNS provider interfaces vary, and some South African `.co.za` registrars may only support apex A records directly, while others may offer an `ALIAS`/`ANAME`/"CNAME flattening" option as an alternative to four separate A records — if that option is available and the registrar's own documentation recommends it for an apex domain, it is usually simpler and safer than manually maintaining four A records. If the registrar's DNS panel behaves unexpectedly for the apex domain, that is a provider-specific detail this plan cannot guess — check with the registrar's own support if needed, or confirm the current exact values shown on GitHub's own custom-domain settings page (Settings → Pages) at the time of setup, since these could occasionally change.

### Redirect behaviour

Once both records above are in place and the custom domain is set to `www.seasonedzgroup.co.za` in GitHub Pages (see next section), GitHub Pages automatically redirects the apex domain (`seasonedzgroup.co.za`) to the configured `www` domain — no separate redirect rule needs to be configured at the DNS provider.

## GitHub Pages Steps (Not Applied Yet)

To be done together, at the actual cutover:

1. In the code: update `vite.config.js` (`base: "/"`) and add `public/CNAME` containing `www.seasonedzgroup.co.za`, then commit, merge, and let the existing GitHub Actions workflow deploy as normal.
2. In the repository: go to **Settings → Pages → Custom domain**.
3. Enter `www.seasonedzgroup.co.za` and click **Save**.
4. Wait for GitHub's automatic DNS check to pass (this can take anywhere from a few minutes to up to 24-48 hours after DNS records are added, depending on DNS propagation).
5. Once the DNS check passes, enable **Enforce HTTPS** (this option only becomes available once GitHub has verified the domain and issued a certificate for it).

## Render CORS Steps (Not Applied Yet)

To be done by the owner directly in Render, at the same time as the GitHub Pages steps above:

1. Open the Render dashboard for the backend service.
2. Go to **Environment**.
3. Update the `FRONTEND_PRODUCTION_URL` variable to include all origins that need to keep working, comma-separated, for example:
   ```
   https://ramagoma212-glitch.github.io,https://www.seasonedzgroup.co.za
   ```
   (The apex `https://seasonedzgroup.co.za` does not strictly need to be listed here, since GitHub Pages redirects it straight to the `www` version before a browser ever loads the page — but it is safe to include if there is ever a reason a request might originate from the bare apex.)
4. Save the change and let Render redeploy the backend.
5. Do not remove the old GitHub Pages origin immediately — keep it in the list until the new domain has been confirmed fully working, then remove it in a later, separate, deliberate step once no longer needed.

**No Render environment variable was changed in this milestone** — this is a plan for the owner to carry out later.

## Post-Connection Test Checklist

Once DNS, GitHub Pages, and Render have all been updated:

- `https://www.seasonedzgroup.co.za` loads the homepage correctly.
- `https://seasonedzgroup.co.za` redirects to `https://www.seasonedzgroup.co.za`.
- HTTPS padlock shows correctly on the new domain (once Enforce HTTPS is enabled).
- Every image and static asset loads (no 404s) — confirms the Vite base path fix worked.
- Shop, product detail, cart, checkout, contact, and every policy page load correctly under the new domain.
- Add to cart, wishlist, and search all still work.
- Checkout still shows PayFast as disabled/"Coming Soon," Bank Transfer and Cash/Card on Delivery still selectable.
- No CORS errors appear in the browser console on any page that calls the API (shop, product detail, checkout, track order) — confirms the Render `FRONTEND_PRODUCTION_URL` update worked.
- The old GitHub Pages URL (`https://ramagoma212-glitch.github.io/seasonedz-ecommerce/`) still loads correctly too, during the transition period.
- Admin login page loads at `https://www.seasonedzgroup.co.za/#/admin/login`, and logged-out admin routes still redirect to it.
- `GET https://seasonedz-ecommerce.onrender.com/api/health` still returns `200`.
- Database counts unchanged: Products 12, ProductImage 25 (or the current count if more real images have been uploaded by then), Orders/Payments/OrderStatusHistory unchanged by the domain connection itself.
- PayFast still disabled: `POST /api/payments/payfast/initiate` still returns `503`.

## Rollback Plan

If something goes wrong after connecting the domain:

1. In GitHub repository Settings → Pages, clear the custom domain field (or leave it, since the old `github.io` URL keeps working regardless of whether a custom domain is also set — GitHub Pages serves both simultaneously once DNS has propagated).
2. If the `vite.config.js`/`CNAME` change was already merged and it's causing the *old* GitHub Pages URL to break, revert that one commit (`git revert`) and push — the next Actions deployment rebuilds with the previous `base` path, restoring the old URL immediately.
3. In Render, revert `FRONTEND_PRODUCTION_URL` back to just the GitHub Pages origin if the new domain's CORS entries are somehow causing unexpected problems (this is very unlikely, since the change made in this milestone is purely additive).
4. DNS changes themselves are not "rolled back" in code — if DNS needs to be undone, that happens directly at the domain registrar, and can take time to propagate back, exactly like any DNS change.

## What Not to Touch (During This Domain Preparation Work)

- Do not enable PayFast or add any PayFast credentials.
- Do not touch Supabase keys.
- Do not upload, delete, or edit any product images.
- Do not edit product prices, stock, names, or descriptions.
- Do not create or change any order.
- Do not touch payment records.
- Do not run `seed.ts`.
- Do not connect the domain or touch DNS until the owner is ready to do the full cutover in one sitting (DNS, GitHub Pages, and Render should all be updated close together, not days apart, to minimise any window where origins don't match).

## PayFast Status

PayFast remains fully disabled throughout this domain preparation work and is unaffected by the domain connection itself. Connecting the domain does not require, and must not be used as a reason to, enable PayFast. That remains its own separate, deliberate decision (see `VERSION_7_PAYFAST_PRODUCTION_READINESS.md`-equivalent findings from Milestone 76).

## Product Images Status

The shared placeholder product images (confirmed in Milestone 73 and re-confirmed in Milestone 75/80) are unaffected by the domain connection and remain the owner's own content work to complete separately, whenever convenient — before or after the domain is connected. Connecting the domain does not fix or require fixing this.

## API Subdomain Migration: api.seasonedzgroup.co.za (Milestone 133)

**Planning + code changes only in this milestone. DNS has not been changed and the Render custom domain has not been added yet.** This section is the step-by-step plan for when the owner is ready to actually connect `api.seasonedzgroup.co.za`.

### Why

Milestone 132B found that customer login works on laptop but not on iPhone: the login request succeeds server-side (a real session is created), but iOS Safari/Chrome — both required by Apple to use the WebKit engine — silently refuses to store the `customer_session` cookie. Root cause: the frontend (`www.seasonedzgroup.co.za`) and backend (`seasonedz-ecommerce.onrender.com`) are different registrable domains, making the cookie genuinely cross-site. WebKit's cross-site tracking prevention can discard such cookies even when `SameSite=None; Secure` is set correctly, which is exactly what was happening.

Moving the API to `api.seasonedzgroup.co.za` — a subdomain of the same `seasonedzgroup.co.za` site the frontend is already on — makes every frontend→API request same-site instead of cross-site. Same-site requests aren't subject to WebKit's cross-site tracking prevention, and the cookie can then also be tightened from `SameSite=None` to the more restrictive `SameSite=Lax`.

### Code changes already made in this milestone (branch `version-7-same-site-api-domain`)

- `.github/workflows/deploy.yml` — production build's `VITE_API_BASE_URL` changed from `https://seasonedz-ecommerce.onrender.com/api` to `https://api.seasonedzgroup.co.za/api`.
- `.env.production.example` — same value, for documentation consistency.
- `backend/src/controllers/customerAuth.controller.ts` and `backend/src/controllers/adminAuth.controller.ts` — `sameSite` changed from `isProduction ? "none" : "lax"` to always `"lax"`.

**Both changes must deploy together, and only after DNS is ready** — see "Deployment Order" below. Deploying the `SameSite=Lax` cookie change while the frontend still calls the `onrender.com` origin would make the cookie genuinely cross-site again, and Lax blocks cross-site cookies entirely — breaking login for everyone, not just iPhone users.

### What stays exactly as it is

- The old `https://seasonedz-ecommerce.onrender.com` URL keeps working — nothing is removed from Render, no old Render URL is deleted.
- PayFast's `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL`, and `BACKEND_PUBLIC_URL` Render environment variables are **not changed** in this milestone — they can keep pointing at the `onrender.com` URL indefinitely; there is no requirement for PayFast's own callback URLs to move to the new API subdomain.
- `FRONTEND_URL`/`FRONTEND_PRODUCTION_URL` (CORS allow-list) do not need to change — the frontend's own origin (`www.seasonedzgroup.co.za`) is unchanged by this migration; only the API's origin moves.
- Password reset links continue to point at `https://www.seasonedzgroup.co.za/account/reset-password?token=...` (the frontend), never the API domain — unaffected by this migration.

### Render Steps (Not Applied Yet — Owner Must Do This Manually)

1. Open the Render dashboard for the backend service.
2. Go to **Settings → Custom Domains** (naming may vary slightly by Render's current UI).
3. Click **Add Custom Domain** and enter:
   ```
   api.seasonedzgroup.co.za
   ```
4. Render will display the exact DNS record it needs — almost always a `CNAME` record pointing `api` at a Render-provided target hostname (something like `<service-name>.onrender.com` or a Render-specific verification hostname). **Use exactly what Render's own dashboard shows at the time of setup, not a guessed value** — Render's target hostname format can change and this document deliberately does not guess it.
5. It is safe to share that DNS host/name/value here in chat if you want a second pair of eyes on it — a CNAME record is a public DNS record, not a secret, unlike an API key or password.

### DNS Steps (Not Applied Yet — Owner Must Do This Manually)

At the domain registrar/DNS provider for `seasonedzgroup.co.za`:

| Type | Host/Name | Value |
|---|---|---|
| CNAME | `api` | *(exactly what Render's dashboard shows in the step above)* |

Wait for DNS to propagate and for Render to show the custom domain as verified/active (Render typically also auto-issues an HTTPS certificate for it once DNS is confirmed — this can take anywhere from a few minutes to a few hours).

### Verification Before Deploying the Code Change

Once Render shows `api.seasonedzgroup.co.za` as active:

```
GET https://api.seasonedzgroup.co.za/api/health
```

should return `200`, from the exact same backend the `onrender.com` URL already serves (this is one backend service with two working hostnames now, not a second deployment).

### Deployment Order

1. Confirm the health check above passes.
2. Push and merge the `version-7-same-site-api-domain` branch (bundles the `VITE_API_BASE_URL` change and the `SameSite=Lax` cookie change together — they must land in the same deploy).
3. Wait for both the Render backend redeploy and the GitHub Pages frontend redeploy to complete.
4. Re-verify the live frontend bundle actually requests `api.seasonedzgroup.co.za`, not `onrender.com`.
5. Test customer login on laptop, then on iPhone (the actual point of this migration).

### Rollback

If something goes wrong: revert the branch's merge commit (`git revert`) and push — this restores `VITE_API_BASE_URL` to the `onrender.com` origin and `sameSite` to the previous `isProduction ? "none" : "lax"` behaviour in one step, since both changes shipped together. The `api.seasonedzgroup.co.za` custom domain and DNS record can simply be left in place afterward (harmless if unused) or removed later at the owner's convenience.
