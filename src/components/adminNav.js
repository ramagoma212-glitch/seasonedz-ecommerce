// Shared top navigation for every protected admin page (Version 7,
// Milestone 59). Deliberately separate from the public site's header
// — this nav only ever appears once already signed in under /admin,
// and is never linked from customer-facing navigation (see
// js/router.js's "no public admin link" comment).
//
// The Sign Out button reuses the existing data-action="admin-logout"
// delegated click handler already wired in js/app.js since Milestone
// 58 — no new event wiring needed here.

// Hotfix 106C: these were still hash-style ("#/admin/...") left over
// from before the Milestone 88A hash-to-path routing migration, which
// missed this file (a mechanical `href="#/..."` find-replace across
// ~35 files didn't catch these, since they're built from a `href:`
// object property, not a literal HTML attribute string). Real paths
// only, matching every other admin link in the codebase.
const NAV_LINKS = [
  { key: "dashboard", href: "/admin", label: "Dashboard" },
  { key: "orders", href: "/admin/orders", label: "Orders" },
  { key: "enquiries", href: "/admin/enquiries", label: "Enquiries" },
  { key: "products", href: "/admin/products", label: "Products" },
  // Version 7, Milestone 171C: genuine review moderation only —
  // approve/reject an existing customer-submitted review, never create
  // one (see pages/adminReviews.js's own header comment).
  { key: "reviews", href: "/admin/reviews", label: "Reviews" },
  // Version 7, Milestone 172B: affiliate recommendation products.
  // Products/Commissions/Overview all live under this one flat link
  // for now, matching this nav's own existing "no nested menu" shape
  // (see 172A's own admin-integration finding) — 172B only builds the
  // Products area; Commissions/Overview arrive in 172D. Dormant for
  // now — kept separate from Referrals below (see the 172B.2 audit).
  { key: "affiliate", href: "/admin/affiliate", label: "Affiliate" },
  // Version 7, Milestone 172B.3: Seasonedz's own affiliate/referral
  // programme — a completely separate feature from the dormant
  // external-merchant "Affiliate" entry above. Overview/Affiliates/
  // Settings live under this one flat link, with their own local
  // sub-navigation (components/referralsSubNav.js) once inside it.
  { key: "referrals", href: "/admin/referrals", label: "Referrals" },
  // Content Studio Phase 2: Brand Knowledge Foundation only — no
  // campaign/generation/scheduling/publishing feature exists behind
  // this link yet. See components/contentStudioSubNav.js.
  { key: "content-studio", href: "/admin/content-studio", label: "Content Studio" },
  // Milestone 179, Part G: shown unconditionally, same as every other
  // link here — this nav has no role-based filtering anywhere (no
  // precedent exists in this codebase for it), and the area itself is
  // fully backend-enforced ADMIN-only (requireAdminRole, see
  // adminUsers.routes.ts). A signed-in STAFF member who clicks this
  // gets a clear "you do not have permission" page, never a broken one
  // — see adminGuard.js's renderAdminForbidden().
  { key: "users", href: "/admin/users", label: "Admin Users" },
];

export function renderAdminNav(activeKey) {
  return `
    <nav class="admin-nav" aria-label="Admin navigation">
      <div class="admin-nav__links">
        ${NAV_LINKS.map(
          (link) =>
            `<a href="${link.href}" class="admin-nav__link${link.key === activeKey ? " admin-nav__link--active" : ""}">${link.label}</a>`
        ).join("")}
      </div>
      <div class="admin-nav__actions">
        <button type="button" class="btn btn--secondary btn--sm" data-action="admin-logout-all">Log Out All Sessions</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="admin-logout">Sign Out</button>
      </div>
    </nav>
  `;
}
