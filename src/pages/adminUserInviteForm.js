// Milestone 179, Part B/G: invite a new admin user — /admin/users/invite.
// Create-only (no edit mode) — role and active/deactivated status
// changes happen from the list page's own action buttons
// (adminUsers.js), not here. Never collects or generates a password:
// submitting this form only creates the account and sends a one-time
// activation link (brief: "never email a permanent password").

import { renderAdminNav } from "../components/adminNav.js";

export async function renderAdminUserInviteForm() {
  return `
    <section class="container admin-page">
      ${renderAdminNav("users")}
      <h1 class="admin-page__title">Invite Admin User</h1>
      <p class="admin-page__subtitle">
        This creates the account and sends a one-time activation link to the email address below.
        The invitee sets their own password when they open it.
      </p>

      <form class="admin-product-form" data-admin-user-invite-form novalidate>
        <div class="form-field">
          <label class="form-field__label" for="adminInviteName">
            Full Name<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <input type="text" id="adminInviteName" name="name" class="form-field__input" required />
          <span class="form-field__error" data-error-for="name"></span>
        </div>

        <div class="form-field">
          <label class="form-field__label" for="adminInviteEmail">
            Email<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <input type="email" id="adminInviteEmail" name="email" class="form-field__input" required autocomplete="off" />
          <span class="form-field__error" data-error-for="email"></span>
          <p class="admin-page__subtitle">Must be this person's own real email address, never a shared inbox.</p>
        </div>

        <div class="form-field">
          <label class="form-field__label" for="adminInviteRole">
            Role<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <select id="adminInviteRole" name="role" class="form-field__input">
            <option value="STAFF" selected>STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <p class="admin-page__subtitle">STAFF is the default and correct choice unless this person needs full admin access.</p>
        </div>

        <div class="form-banner form-banner--error" data-admin-user-invite-banner hidden></div>

        <button type="submit" class="btn btn--primary">Send Invitation</button>
      </form>
      <p class="account-form__note"><a href="/admin/users">Back to Admin Users</a></p>
    </section>
  `;
}
