// Returns policy page. Kept plain and practical — no complicated legal
// language, just clear guidance.

import { renderContactSupportNote } from "../components/contactSupportNote.js";

export function renderReturnsPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Returns Policy</h1>
      <p class="stub-page__text">
        We want you to be happy with what you order. Here's how returns work.
      </p>

      <div class="info-page__body policy-page">
        <h2>Damaged or Incorrect Items</h2>
        <p>
          If an item arrives damaged, faulty, or isn't what you ordered,
          please contact us as soon as possible so we can sort it out,
          whether that's a replacement or a refund.
        </p>

        <h2>Change of Mind Returns</h2>
        <p>
          If you'd like to return an item you no longer want, please get in
          touch first. Items should be unused, in their original packaging
          and in resellable condition.
        </p>

        <h2>How to Start a Return</h2>
        <p>Contact us with the following, and we'll guide you through the next steps:</p>
        <ul>
          <li>Your order number</li>
          <li>The item(s) you'd like to return</li>
          <li>A short description of the issue (if applicable)</li>
          <li>A photo, if the item arrived damaged or incorrect</li>
        </ul>

        <h2>Getting in Touch</h2>
        <p>
          The easiest way to start a return is via our
          <a href="#/contact">Contact page</a>, or reach us directly below.
          We'll respond with clear next steps for your specific order.
        </p>
        ${renderContactSupportNote("Ready to start a return?")}
      </div>
    </section>
  `;
}
