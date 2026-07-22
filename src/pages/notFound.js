// 404 page. Used by router.js as the fallback whenever a hash route
// doesn't match anything defined in routeDefs.

export function renderNotFound() {
  return `
    <section class="stub-page container not-found-page">
      <p class="not-found-page__code">404</p>
      <h1 class="stub-page__title">Page Not Found</h1>
      <p class="stub-page__text">
        Sorry, we couldn't find the page you were looking for. It may have
        been moved, or the link may be incorrect.
      </p>

      <div class="not-found-page__actions">
        <a class="btn btn--primary" href="/">Back to Homepage</a>
        <a class="btn btn--secondary" href="/shop">Browse the Shop</a>
      </div>

      <p class="not-found-page__hint">
        Looking for something specific? Try the search bar at the top of the page.
      </p>
    </section>
  `;
}
