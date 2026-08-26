// Affiliate Programme Terms (Version 7, Milestone 172B.6) — a new,
// dedicated page at /affiliate-terms, in the same plain-language,
// numbered-section style as the existing owner-approved legal pages
// (terms.js, privacyPolicy.js, cookiesPolicy.js). Every rate/number
// here matches the current, real AffiliateProgrammeSettings defaults
// and the actual lifecycle behaviour this backend implements — nothing
// here is a promise the code doesn't keep, and nothing here claims a
// legal guarantee this business can't make.

import { businessInfo } from "../data/businessInfo.js";

function renderOfficeAddress() {
  return businessInfo.registeredOfficeLines.join("<br />");
}

export function renderAffiliateTerms() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Affiliate Programme Terms</h1>
      <p class="stub-page__text">Last updated: 26 August 2026</p>

      <div class="info-page__body policy-page">
        <p>
          These terms explain how the Seasonedz Affiliate Programme works. They apply
          alongside our general <a href="/terms">Terms and Conditions</a> and
          <a href="/privacy-policy">Privacy Policy</a>.
        </p>

        <h2>1. Who Operates This Programme</h2>
        <p><strong>${businessInfo.registeredName}</strong> ("Seasonedz Group", "we", "us") operates the
          Seasonedz Affiliate Programme entirely itself. It is not run by, or shared with, any
          external platform or third party affiliate network.</p>

        <h2>2. The Affiliate Relationship</h2>
        <p>Becoming an affiliate does not make you an employee, partner, agent or joint venturer of
          Seasonedz Group. You promote Seasonedz Group products independently, using your own
          referral link, in exchange for a commission on qualifying sales you genuinely refer.</p>
        <p>Applications are reviewed by Seasonedz Group. Approval is not automatic and is not
          guaranteed.</p>

        <h2>3. Becoming an Affiliate</h2>
        <p>To apply, you must have a Seasonedz Group customer account. Your application uses the
          name, email address and phone number already on that account. Applying creates a Pending
          application; it does not grant any active referral link until Seasonedz Group approves it.</p>
        <p>Seasonedz Group may reject an application, or suspend or reject an existing affiliate, at
          its own reasonable discretion — for example where information provided is inaccurate, or
          where we reasonably suspect abuse of the programme.</p>

        <h2>4. Your Referral Link and Discount Rate</h2>
        <p>Once approved, you receive a personal referral code and link. A customer who places a
          qualifying order after following your link, within the current attribution window
          (currently 30 days from when the link was followed), receives an automatic discount on
          their qualifying product subtotal at checkout — currently 5% by default, though Seasonedz
          Group may set a different rate for your account specifically.</p>
        <p>Only the most recently followed valid referral link applies to a given order.</p>

        <h2>5. Your Commission Rate</h2>
        <p>You earn a commission on the net qualifying amount of a genuinely referred order (the
          qualifying product subtotal, after the customer's own referral discount is deducted — never
          on delivery fees or gift wrapping). The default commission rate is currently 7%, though
          Seasonedz Group may set a different rate for your account specifically.</p>

        <h2>6. Rates May Change</h2>
        <p>Seasonedz Group may change the programme's default discount rate, commission rate, or your
          own account-specific rate, at any time, for future orders. A rate change is never applied
          retroactively: every commission and discount already recorded permanently keeps the exact
          rate and amount that applied at the time of that order, even if the programme's rates
          change afterwards.</p>

        <h2>7. Self-Referral</h2>
        <p>You may use your own referral link on your own genuine, qualifying purchase and receive
          the customer referral discount. However, no commission is ever created or paid on your own
          purchase, regardless of the order's value.</p>

        <h2>8. Commission Validation Period</h2>
        <p>A commission does not become approved the moment an order is placed, or even the moment it
          is paid. It must also be genuinely fulfilled (delivered, collected, or — for a digital-only
          order — paid for) and remain unreversed for a validation period, currently 30 days, before
          Seasonedz Group reviews and approves it.</p>

        <h2>9. Reversed Commissions</h2>
        <p>If a referred order is cancelled or fully refunded, its commission is reversed and is never
          paid. If a commission was already paid before an order was cancelled or refunded, Seasonedz
          Group will review the matter directly with the affiliate concerned; this does not happen
          automatically. Partial refunds are reviewed manually by Seasonedz Group and are not
          automatically recalculated.</p>

        <h2>10. Payouts</h2>
        <p>Approved commissions are paid out manually by Seasonedz Group, off-platform (for example by
          bank transfer), on a monthly cycle, once your approved unpaid balance reaches the minimum
          payout amount — currently R500. Seasonedz Group targets paying eligible balances by the
          15th of the following month, though this is an operational target, not a guaranteed date.
          If your approved balance has not yet reached the minimum, it is never lost or expired — it
          simply carries forward to the next cycle.</p>

        <h2>11. No Guarantee of Earnings</h2>
        <p>Seasonedz Group makes no promise or guarantee about how much, if anything, you will earn
          through the Affiliate Programme. Earnings depend entirely on genuine customer referrals and
          completed, qualifying orders.</p>

        <h2>12. Honest Promotion and Disclosure</h2>
        <p>You are responsible for promoting your referral link honestly and lawfully. When you share
          your link publicly (for example on social media, a blog, or in a message to others), you
          must clearly disclose that you may earn a commission — for example, "I may earn a commission
          if you purchase through my Seasonedz referral link." The exact wording is up to you, as long
          as the commercial relationship is clear to the person you're sharing it with.</p>
        <p>You may not misrepresent Seasonedz Group products, pricing, or your relationship with
          Seasonedz Group, and you may not use your link in spam, misleading advertising, or on
          content that infringes anyone else's rights.</p>

        <h2>13. Prohibited Abuse and Fraud</h2>
        <p>You may not attempt to generate false, fraudulent, or artificially inflated referrals or
          commissions — including, but not limited to, referring fake orders, colluding with another
          person to abuse the discount or commission rules, or attempting to tamper with, guess, or
          forge referral attribution data. Seasonedz Group may suspend or reject any affiliate
          account, and withhold or reverse any related commission, where we reasonably suspect this
          kind of abuse.</p>

        <h2>14. Suspension and Rejection</h2>
        <p>Seasonedz Group may suspend an active affiliate, or decline an application, at its own
          reasonable discretion. Suspension stops new referral activity from earning further
          commission; it does not remove or alter historical commission records already earned in
          good faith before the suspension.</p>

        <h2>15. Changes to These Terms</h2>
        <p>Seasonedz Group may update these Affiliate Programme Terms from time to time. The latest
          version will always be published at this page.</p>

        <h2>16. Contact Us</h2>
        <p>For any question about the Affiliate Programme, contact:</p>
        <p><strong>${businessInfo.businessName}</strong></p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Website:</strong> <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>
        </p>
        <p>${renderOfficeAddress()}</p>

        <p class="about-closing"><strong>Where Creativity Meets Purpose.</strong></p>
      </div>
    </section>
  `;
}
