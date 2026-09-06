// Milestone 182, Part F/G/H: the Campaign Brief review page. Shows the
// generated brief text exactly as it will be pasted into Zeely, a Copy
// for Zeely button, a Download as .txt link, manually-controlled
// workflow status buttons, and lightweight content records. This page
// never calls a paid AI provider and never talks to Zeely directly
// (Part I) — every "send to Zeely" step is the admin/staff member
// copying text and pasting it themselves.

import { getAdminCampaignBrief } from "../js/api/campaignBriefApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

// Mirrors campaignBrief.service.ts's own ALLOWED_STATUS_TRANSITIONS —
// display only; the backend independently re-validates every
// transition regardless of what button this page happens to show.
const STATUS_TRANSITIONS = {
  DRAFT: ["READY_FOR_ZEELY"],
  READY_FOR_ZEELY: ["CREATED_IN_ZEELY", "DRAFT"],
  CREATED_IN_ZEELY: ["APPROVED", "READY_FOR_ZEELY"],
  APPROVED: ["SCHEDULED", "CREATED_IN_ZEELY"],
  SCHEDULED: ["PUBLISHED", "APPROVED"],
  PUBLISHED: [],
  ARCHIVED: [],
};

const CONTENT_PLATFORM_OPTIONS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "WHATSAPP", "X", "LINKEDIN", "REDDIT"];

function renderStatusActions(brief, isAdmin) {
  const nextStatuses = STATUS_TRANSITIONS[brief.status] || [];
  const canArchive = brief.status !== "ARCHIVED";

  return `
    <div class="admin-campaign-brief__status-actions">
      ${nextStatuses
        .map(
          (status) =>
            `<button type="button" class="btn btn--secondary btn--sm" data-action="campaign-brief-set-status" data-brief-id="${escapeHtml(brief.id)}" data-status="${status}">Move to ${escapeHtml(humanizeEnum(status))}</button>`
        )
        .join("")}
      ${
        canArchive && isAdmin
          ? `<button type="button" class="btn btn--danger btn--sm" data-action="campaign-brief-archive" data-brief-id="${escapeHtml(brief.id)}">Archive</button>`
          : ""
      }
    </div>
  `;
}

function renderContentRecordsSection(brief) {
  const records = brief.contentRecords || [];
  return `
    <section class="admin-campaign-brief__content-records" data-admin-content-records data-brief-id="${escapeHtml(brief.id)}">
      <h2 class="admin-page__section-title">Content Created in Zeely</h2>
      <p class="admin-page__subtitle">A lightweight record of what was actually created and published. Entered by hand, never automatically detected.</p>
      ${
        records.length > 0
          ? `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr><th>Type</th><th>Platform</th><th>Caption</th><th>Scheduled</th><th>Published</th><th>Reference</th><th></th></tr>
            </thead>
            <tbody>
              ${records
                .map(
                  (record) => `
                <tr data-content-record-row="${escapeHtml(record.id)}">
                  <td>${escapeHtml(record.contentType)}</td>
                  <td>${record.platform ? escapeHtml(record.platform) : "N/A"}</td>
                  <td>${record.caption ? escapeHtml(record.caption) : "N/A"}</td>
                  <td>${record.scheduledAt ? formatDate(record.scheduledAt) : "N/A"}</td>
                  <td>${record.publishedAt ? formatDate(record.publishedAt) : "N/A"}</td>
                  <td>${record.externalReference ? escapeHtml(record.externalReference) : "N/A"}</td>
                  <td><button type="button" class="btn btn--secondary btn--sm" data-action="campaign-content-record-delete" data-brief-id="${escapeHtml(brief.id)}" data-record-id="${escapeHtml(record.id)}">Remove</button></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : `<p class="admin-empty">No content recorded yet.</p>`
      }

      <form class="admin-product-form" data-admin-content-record-form data-brief-id="${escapeHtml(brief.id)}" novalidate>
        <h3 class="admin-page__section-subtitle">Record New Content</h3>
        <div class="admin-product-form__row">
          <div class="form-field">
            <label class="form-field__label" for="contentRecordType">Content Type <span class="form-field__required">*</span></label>
            <input type="text" id="contentRecordType" class="form-field__input" maxlength="50" placeholder="e.g. Reel, Carousel, Story" required />
          </div>
          <div class="form-field">
            <label class="form-field__label" for="contentRecordPlatform">Platform <span class="form-field__optional">(optional)</span></label>
            <select id="contentRecordPlatform" class="form-field__input">
              <option value="">None</option>
              ${CONTENT_PLATFORM_OPTIONS.map((platform) => `<option value="${platform}">${escapeHtml(platform)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="contentRecordCaption">Caption <span class="form-field__optional">(optional)</span></label>
          <textarea id="contentRecordCaption" class="form-field__input form-field__textarea" rows="2" maxlength="2000"></textarea>
        </div>
        <div class="admin-product-form__row">
          <div class="form-field">
            <label class="form-field__label" for="contentRecordScheduledAt">Scheduled Date <span class="form-field__optional">(optional)</span></label>
            <input type="date" id="contentRecordScheduledAt" class="form-field__input" />
          </div>
          <div class="form-field">
            <label class="form-field__label" for="contentRecordPublishedAt">Published Date <span class="form-field__optional">(optional)</span></label>
            <input type="date" id="contentRecordPublishedAt" class="form-field__input" />
          </div>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="contentRecordExternalReference">External Reference / Link <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="contentRecordExternalReference" class="form-field__input" maxlength="500" placeholder="Zeely link or reference" />
        </div>
        <div class="form-banner form-banner--error" data-admin-content-record-banner hidden></div>
        <button type="submit" class="btn btn--secondary">Add Content Record</button>
      </form>
    </section>
  `;
}

export async function renderAdminCampaignBriefDetail({ id } = {}) {
  if (!id) {
    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Campaign Brief Not Found</h1>
        <a class="btn btn--secondary" href="/admin/content-studio/campaign-briefs">Back to Campaign Briefs</a>
      </section>
    `;
  }

  try {
    const [adminResponse, briefResponse] = await Promise.all([getCurrentAdmin(), getAdminCampaignBrief(id)]);
    const isAdmin = adminResponse.data.admin.role === "ADMIN";
    const brief = briefResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("campaign-briefs")}
        <a class="admin-back-link" href="/admin/content-studio/campaign-briefs">&larr; Back to Campaign Briefs</a>

        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${brief.product ? escapeHtml(brief.product.name) : "Campaign Brief"}</h2>
          ${renderStatusBadge(brief.status)}
        </div>
        <p class="admin-page__subtitle">
          Goal: ${escapeHtml(humanizeEnum(brief.goal))}. Audience: ${brief.audience ? escapeHtml(brief.audience.name) : "N/A"}. Pillar:
          ${brief.pillar ? escapeHtml(brief.pillar.name) : "N/A"}. Platforms: ${brief.platforms.map(humanizeEnum).join(", ")}.
          Generated ${formatDateTime(brief.generatedAt)}.
        </p>

        <div class="admin-campaign-brief__actions">
          <a class="btn btn--secondary btn--sm" href="/admin/content-studio/campaign-briefs/${encodeURIComponent(brief.id)}/edit">Edit</a>
          <button type="button" class="btn btn--secondary btn--sm" data-action="campaign-brief-regenerate" data-brief-id="${escapeHtml(brief.id)}">Regenerate</button>
          <button type="button" class="btn btn--primary btn--sm" data-action="campaign-brief-copy" data-brief-id="${escapeHtml(brief.id)}">Copy for Zeely</button>
          <button type="button" class="btn btn--secondary btn--sm" data-action="campaign-brief-download" data-brief-id="${escapeHtml(brief.id)}">Download as .txt</button>
        </div>
        ${renderStatusActions(brief, isAdmin)}

        <div class="form-banner form-banner--error" data-admin-campaign-brief-detail-banner hidden></div>

        <h3 class="admin-page__section-subtitle">Zeely Campaign Brief</h3>
        <pre class="admin-campaign-brief__text" data-admin-campaign-brief-text>${escapeHtml(brief.generatedBriefText)}</pre>

        ${renderContentRecordsSection(brief)}
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
