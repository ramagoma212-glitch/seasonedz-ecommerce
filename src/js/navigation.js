// Programmatic path-routing navigation (Version 7, Milestone 88A —
// path routing migration, replacing the old
// `window.location.hash = "/x"` pattern).
//
// Pushes a new History entry and fires a "popstate" event so
// router.js's own popstate listener re-renders the matching route —
// this file deliberately never imports router.js, and router.js never
// imports anything back from here beyond this one function, so the two
// only ever communicate through the popstate event, the same way a
// real Back/Forward button press already does.
//
// The dispatch is deferred to a fresh task (not fired synchronously)
// so a call made from inside a render function itself (e.g. the admin
// "/admin/products/:id" -> ".../edit" redirect) can't re-enter the
// router before the current render has finished — a real browser
// navigation event is never synchronous either, so this keeps the two
// paths consistent instead of introducing a re-entrancy risk that
// hashchange never had.
export function navigateTo(path) {
  const current = `${window.location.pathname}${window.location.search}`;
  if (path === current) return;

  window.history.pushState(null, "", path);
  setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate")), 0);
}
