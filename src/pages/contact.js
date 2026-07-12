// Contact page. Static contact details only — no contact form submission
// logic yet, since there is no backend to send it to.

export function renderContact() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Contact Us</h1>
      <p class="stub-page__text">
        Have a question about our products, or interested in schools and
        wholesale orders? Reach out to us.
      </p>
      <div class="placeholder-panel">
        Email: hello@seasonedzgroup.com<br />
        Phone: +27 00 000 0000
      </div>
    </section>
  `;
}
