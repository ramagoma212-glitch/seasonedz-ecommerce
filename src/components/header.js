// Site header component: logo, navigation, working search bar,
// wishlist/cart links and a mobile menu button.
// Nav links and the search bar share one collapsible panel
// (.site-header__collapsible) so both are reachable on mobile, opened
// by the hamburger button (wired up in js/app.js).
// Cart/wishlist badge counts start at 0 here and are kept in sync with
// Local Storage by updateHeaderCounters() in js/app.js (the header is
// only mounted once, so this markup itself never changes those numbers).

import { withBase } from "../js/paths.js";

// Version 7, Milestone 150: nav items reworked for the homepage
// redesign brief. Several don't have a dedicated route/category of
// their own yet — mapped to the closest real, working destination
// rather than a broken link, each noted here so it's easy to revisit
// once a more specific route exists:
//  - "Colouring Books" has no single matching category (there are
//    three: Kids/Bible/Mindfulness) — links to /shop.
//  - "Creative Supplies" maps to the real "Markers and Crayons"
//    category (closest existing match) — Version 7, Milestone 171I:
//    now its own real page at /category/markers-and-crayons rather
//    than a "/shop?category=" query filter, see categoryPage.js.
//  - "Digital Downloads" has no route at all yet (no digital product
//    records exist — see pages/home.js's Digital Colouring Books
//    section) — links to /shop.
//  - "Schools and Churches" links to the existing /schools page,
//    which doesn't separately mention churches in its own content.
// "Categories" and "FAQ" were on the old nav but aren't in the new
// brief's 8-item list — dropped from primary nav, but both routes are
// untouched and still fully reachable (footer, etc. still link to them
// where relevant). "My Account" is back (Milestone 151) as its own
// icon link in .site-header__actions, not this list — see the
// Logo -> Nav -> Search -> Account -> Wishlist -> Cart order below.
//
// Version 7, Milestone 168C: the same 8 destinations now split across
// two roles, still sharing this one array (so mobile and desktop can
// never quietly drift apart into two different route lists). `inMore`
// items render as an ordinary top-level link in the mobile panel
// (unchanged — Part 7 requires mobile keep direct access to all 8),
// but are hidden at the desktop breakpoint in favour of appearing once
// more inside the new "More" dropdown (see MORE_NAV_LINKS/renderMoreMenu
// below) — CSS (.nav-link--in-more, responsive.css) is what actually
// hides them on desktop; this file just marks which ones qualify.
const NAV_LINKS = [
  { href: "/", label: "Home", inMore: false },
  { href: "/shop", label: "Shop", inMore: false },
  { href: "/shop", label: "Colouring Books", inMore: true },
  { href: "/category/markers-and-crayons", label: "Creative Supplies", inMore: true },
  { href: "/shop", label: "Digital Downloads", inMore: false },
  { href: "/schools", label: "Schools & Churches", inMore: true },
  // Version 7, Milestone 175: links to the existing customer-account
  // entry point (accountPage.js's own Affiliate Programme section) —
  // never a new page. /account itself already handles both cases: a
  // logged-out visitor sees the existing login/register toggle, a
  // logged-in customer sees their real application/portal status
  // exactly as before, unchanged.
  { href: "/account", label: "Affiliate Programme", inMore: true },
  { href: "/about", label: "About", inMore: true },
  { href: "/contact", label: "Contact", inMore: false },
];

// Version 7, Milestone 168C: the desktop-only "More" dropdown reuses
// the exact same destinations already marked inMore above (derived,
// not a second hand-maintained list) — real internal <a href> links,
// never onclick-only navigation, so they work with Ctrl/Cmd-click,
// "Open in new tab", and screen readers exactly like every other nav
// link. Duplicated as separate DOM nodes from the mobile-panel copies
// (a link can only exist in one place in the DOM at a time) rather
// than moved, so both the mobile panel and this dropdown always show
// the same 4 links without needing to stay manually in sync.
const MORE_NAV_LINKS = NAV_LINKS.filter((link) => link.inMore);

function renderMoreMenu() {
  return `
    <li class="nav-more">
      <button
        type="button"
        class="nav-link nav-more__trigger"
        id="nav-more-trigger"
        data-action="toggle-nav-more"
        aria-expanded="false"
        aria-controls="nav-more-panel"
      >
        More
        <span class="nav-more__chevron" aria-hidden="true">&#9662;</span>
      </button>
      <div class="nav-more__panel" id="nav-more-panel" role="menu" aria-label="More navigation" hidden>
        ${MORE_NAV_LINKS.map((link) => `<a class="nav-more__link" role="menuitem" href="${link.href}">${link.label}</a>`).join("")}
      </div>
    </li>
  `;
}

export function renderHeader() {
  return `
    <div class="announcement-bar">
      <p class="announcement-bar__text">Educational creativity for every stage &nbsp;|&nbsp; Nationwide delivery across South Africa</p>
    </div>
    <header class="site-header">
      <div class="container site-header__inner">
        <a href="/" class="logo">
          <!--
            Version 7, Milestone 92A: 40x40 matches .logo img's own
            CSS (height: 40px; width: auto) and the source file's true
            1:1 aspect ratio (confirmed 1250x1250) — always above the
            fold (part of the persistent header), so eager/no lazy
            loading; decoding="async" is still safe since it only
            affects decode scheduling, not fetch priority.
          -->
          <img
            src="${withBase("/images/logo-placeholder.jpeg")}"
            alt="Seasonedz Group logo"
            width="40"
            height="40"
            loading="eager"
            decoding="async"
          />
          <span class="logo__text">Seasonedz</span>
        </a>

        <div class="site-header__collapsible" id="site-header-collapsible">
          <nav class="site-header__nav" aria-label="Main navigation">
            <ul class="site-header__nav-list">
              ${NAV_LINKS.map((link) => `<li><a class="nav-link${link.inMore ? " nav-link--in-more" : ""}" href="${link.href}">${link.label}</a></li>`).join("")}
              ${renderMoreMenu()}
            </ul>
          </nav>

          <form class="site-header__search search-bar" role="search" aria-label="Search products">
            <input
              type="search"
              name="q"
              placeholder="Search..."
              aria-label="Search"
              autocomplete="off"
            />
            <button type="submit" class="search-bar__submit" aria-label="Submit search">&#128269;</button>
          </form>
        </div>

        <div class="site-header__actions">
          <a class="icon-link" href="/account" aria-label="Account">
            &#128100;
          </a>
          <a class="icon-link" href="/wishlist" aria-label="Wishlist">
            &hearts;
            <span class="icon-link__badge" data-badge="wishlist">0</span>
          </a>
          <a class="icon-link" href="/cart" aria-label="Cart">
            &#128722;
            <span class="icon-link__badge" data-badge="cart">0</span>
          </a>
          <button
            type="button"
            class="mobile-toggle site-header__mobile-toggle"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="site-header-collapsible"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>
  `;
}
