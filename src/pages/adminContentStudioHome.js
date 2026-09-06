// Milestone 182, Part C: the Content Studio landing page. Repurposes
// Content Studio Phase 2/3A (Brand Knowledge, Content Pillars,
// Audiences, Context Preview — all unchanged, all still reachable) as
// the "Seasonedz Marketing Control Centre": a place to plan campaigns
// and prepare Zeely Campaign Briefs, not a chatbot and not a paid AI
// generation tool. See campaignBrief.service.ts's own header comment
// for the full architecture.

import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";

const SECTIONS = [
  {
    href: "/admin/content-studio/campaign-briefs",
    title: "Campaign Briefs",
    description: "Prepare a structured brief for a product, audience, pillar and platforms, then copy it into Zeely to create the actual content.",
  },
  {
    href: "/admin/content-studio/brand-knowledge",
    title: "Brand Knowledge",
    description: "Brand voice, writing rules, visual rules, approved claims and claims to avoid. The source of truth every brief is built from.",
  },
  {
    href: "/admin/content-studio/pillars",
    title: "Content Pillars",
    description: "Named marketing content categories used to steer campaign planning.",
  },
  {
    href: "/admin/content-studio/audiences",
    title: "Audiences",
    description: "Named audience groups (parents, teachers, schools, churches, and more) used to target a campaign brief.",
  },
  {
    href: "/admin/content-studio/context-preview",
    title: "Context Preview",
    description: "See exactly what data a product, audience and pillar selection would assemble, before preparing a brief.",
  },
];

function renderSectionCard(section) {
  return `
    <a class="admin-content-studio-card" href="${section.href}">
      <h3 class="admin-page__section-title">${section.title}</h3>
      <p>${section.description}</p>
    </a>
  `;
}

export async function renderAdminContentStudioHome() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("home")}
        <p class="admin-page__subtitle">
          Plan Seasonedz campaigns, prepare content briefs and keep marketing aligned with our products and brand.
          Zeely is used to actually create captions, images and video. This tool prepares an accurate brief to bring
          there, using real product data and our stored brand knowledge.
        </p>
        <div class="admin-content-studio-grid">
          ${SECTIONS.map(renderSectionCard).join("")}
        </div>
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
