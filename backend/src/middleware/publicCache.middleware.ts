// Milestone 190B, Part S: short-lived HTTP caching for genuinely
// public, unauthenticated, read-only catalogue data. Measured first
// (Part AQ/R): the production API already sits behind Cloudflare
// (confirmed via response headers — `Server: cloudflare`, a `CF-RAY`
// id present on every response) but every response currently reports
// `cf-cache-status: DYNAMIC` — nothing here has ever told Cloudflare
// (or a browser) it's safe to cache, so every single request, from
// every visitor, still reaches Render and Supabase. Adding a short,
// conservative Cache-Control is what actually lets that already-present
// CDN start absorbing repeat requests — this is a real, evidence-backed
// win, not a guess.
//
// Deliberately opt-in per router (applied only to product.routes.ts,
// category.routes.ts and preorder.routes.ts — see each file's own
// `router.use(publicCache(...))` call), never global: every other route
// in this backend (customer, admin, checkout, orders, secure downloads,
// welcome gift, payments) must never carry a cache header that could
// let a shared cache serve one visitor's private response to another,
// or let checkout/order data go stale — see this middleware's own
// narrow scope for why applying it broadly would be dangerous.
//
// 60 seconds: short enough that a genuine stock/price change (still
// always re-validated authoritatively at order-creation time — this
// middleware changes nothing about that) reaches every visitor within
// a minute, long enough to meaningfully absorb bursty repeat traffic
// for the same product/category/settings response. `public` (not
// `private`) is what actually permits Cloudflare's shared cache to
// store it; `stale-while-revalidate` lets a cache serve one slightly-
// stale response while it quietly re-fetches, rather than a visitor
// ever waiting on a cold fetch right at the boundary.
import type { Request, Response, NextFunction } from "express";

export function publicCache(maxAgeSeconds: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set("Cache-Control", `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`);
    next();
  };
}
