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
//    category (closest existing match).
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
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/shop", label: "Colouring Books" },
  { href: "/shop?category=markers-and-crayons", label: "Creative Supplies" },
  { href: "/shop", label: "Digital Downloads" },
  { href: "/schools", label: "Schools & Churches" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

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
              ${NAV_LINKS.map((link) => `<li><a class="nav-link" href="${link.href}">${link.label}</a></li>`).join("")}
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
