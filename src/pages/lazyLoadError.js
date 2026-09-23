// Milestone 190B, Part AS: shown when a lazy-loaded route's dynamic
// import() rejects — a stale chunk reference after a new deploy
// replaced the hashed filenames GitHub Pages serves (Part AT), a
// network interruption, or a temporary CDN issue. Deliberately generic
// — never the underlying error's message, module path, or chunk
// filename, matching this app's existing "never leak internals"
// discipline elsewhere (e.g. welcomeGift.controller.ts). A reload is
// the correct fix for the stale-chunk case specifically (it re-fetches
// the current index.html, which references the current chunk hashes),
// so that's the one action offered rather than a generic "try again"
// that wouldn't actually resolve a stale-deployment reference.
export function renderLazyLoadError() {
  return `
    <section class="container">
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#9888;</span>
        <div>
          <strong>This page couldn't load.</strong>
          <p>This can happen after a site update, or with a slow or interrupted connection. Reloading the page usually fixes it.</p>
          <button type="button" class="btn btn--secondary" data-action="reload-page">Reload Page</button>
        </div>
      </div>
    </section>
  `;
}
