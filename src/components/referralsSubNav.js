// Version 7, Milestone 172B.3: local sub-navigation within the
// /admin/referrals section — Overview / Affiliates / Settings each get
// their own route (matching this project's existing "one concern, one
// route" admin convention, e.g. /admin/products vs /admin/products/new),
// but the top-level admin nav only has one flat "Referrals" entry
// pointing at /admin/referrals, so this small local strip is how a
// visitor moves between the three areas underneath it.

const SUB_NAV_LINKS = [
  { key: "overview", href: "/admin/referrals", label: "Overview" },
  { key: "affiliates", href: "/admin/referrals/affiliates", label: "Affiliates" },
  // Version 7, Milestone 172B.5: the real commission lifecycle and
  // payout views.
  { key: "commissions", href: "/admin/referrals/commissions", label: "Commissions" },
  { key: "payouts", href: "/admin/referrals/payouts", label: "Payouts" },
  { key: "settings", href: "/admin/referrals/settings", label: "Settings" },
];

export function renderReferralsSubNav(activeKey) {
  return `
    <nav class="admin-nav" aria-label="Referrals section navigation">
      <div class="admin-nav__links">
        ${SUB_NAV_LINKS.map(
          (link) => `<a href="${link.href}" class="admin-nav__link${link.key === activeKey ? " admin-nav__link--active" : ""}">${link.label}</a>`
        ).join("")}
      </div>
    </nav>
  `;
}
