// Shared top navigation for every protected admin page (Version 7,
// Milestone 59). Deliberately separate from the public site's header
// — this nav only ever appears once already signed in under /admin,
// and is never linked from customer-facing navigation (see
// js/router.js's "no public admin link" comment).
//
// The Sign Out button reuses the existing data-action="admin-logout"
// delegated click handler already wired in js/app.js since Milestone
// 58 — no new event wiring needed here.

const NAV_LINKS = [
  { key: "dashboard", href: "#/admin", label: "Dashboard" },
  { key: "orders", href: "#/admin/orders", label: "Orders" },
  { key: "enquiries", href: "#/admin/enquiries", label: "Enquiries" },
  { key: "products", href: "#/admin/products", label: "Products" },
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
      <button type="button" class="btn btn--secondary btn--sm" data-action="admin-logout">Sign Out</button>
    </nav>
  `;
}
