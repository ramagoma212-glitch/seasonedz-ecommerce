// Milestone 198: local sub-navigation within the /admin/outreach
// section — Contacts / Campaigns / Suppression List / Sending History
// each get their own route, but the top-level admin nav only has one
// flat "Outreach" entry, so this small local strip is how a visitor
// moves between the four areas underneath it — same shape as
// referralsSubNav.js.

const SUB_NAV_LINKS = [
  { key: "contacts", href: "/admin/outreach/contacts", label: "Contacts" },
  { key: "followups", href: "/admin/outreach/follow-ups", label: "Follow-ups" },
  { key: "quotations", href: "/admin/outreach/quotations", label: "Quotations" },
  { key: "campaigns", href: "/admin/outreach/campaigns", label: "Campaigns" },
  { key: "suppression", href: "/admin/outreach/suppressed", label: "Suppression List" },
  { key: "history", href: "/admin/outreach/history", label: "Sending History" },
];

export function renderOutreachSubNav(activeKey) {
  return `
    <nav class="admin-nav" aria-label="Outreach section navigation">
      <div class="admin-nav__links">
        ${SUB_NAV_LINKS.map(
          (link) => `<a href="${link.href}" class="admin-nav__link${link.key === activeKey ? " admin-nav__link--active" : ""}">${link.label}</a>`
        ).join("")}
      </div>
    </nav>
  `;
}
