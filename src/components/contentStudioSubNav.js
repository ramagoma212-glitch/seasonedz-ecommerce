// Content Studio Phase 2: local sub-navigation within
// /admin/content-studio, same "one flat top-level admin nav entry,
// small local strip underneath it" shape as referralsSubNav.js. Only
// the three areas this phase actually builds — no Video Studio,
// Campaigns or Analytics link exists here, matching brief section 18's
// "do not expose empty future sections merely to make the dashboard
// look larger" instruction.

const SUB_NAV_LINKS = [
  { key: "brand-knowledge", href: "/admin/content-studio", label: "Brand Knowledge" },
  { key: "pillars", href: "/admin/content-studio/pillars", label: "Content Pillars" },
  { key: "audiences", href: "/admin/content-studio/audiences", label: "Audiences" },
  // Phase 3A: a read-only preview of the structured context a future
  // AI request would receive — never a generation. See
  // pages/adminContentContextPreview.js's own header comment.
  { key: "context-preview", href: "/admin/content-studio/context-preview", label: "Context Preview" },
];

export function renderContentStudioSubNav(activeKey) {
  return `
    <nav class="admin-nav" aria-label="Content Studio section navigation">
      <div class="admin-nav__links">
        ${SUB_NAV_LINKS.map(
          (link) => `<a href="${link.href}" class="admin-nav__link${link.key === activeKey ? " admin-nav__link--active" : ""}">${link.label}</a>`
        ).join("")}
      </div>
    </nav>
  `;
}
