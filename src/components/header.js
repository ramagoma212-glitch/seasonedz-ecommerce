// Site header component: logo, navigation, working search bar,
// wishlist/cart links and a mobile menu button.
// Nav links and the search bar share one collapsible panel
// (.site-header__collapsible) so both are reachable on mobile, opened
// by the hamburger button (wired up in js/app.js).
// Cart/wishlist badge counts start at 0 here and are kept in sync with
// Local Storage by updateHeaderCounters() in js/app.js (the header is
// only mounted once, so this markup itself never changes those numbers).

import { withBase } from "../js/paths.js";

export function renderHeader() {
  return `
    <header class="site-header">
      <div class="container site-header__inner">
        <a href="#/" class="logo">
          <img src="${withBase("/images/logo-placeholder.jpeg")}" alt="Seasonedz Group logo" />
          <span class="logo__text">Seasonedz</span>
        </a>

        <div class="site-header__collapsible">
          <nav class="site-header__nav" aria-label="Main navigation">
            <ul class="site-header__nav-list">
              <li><a class="nav-link" href="#/">Home</a></li>
              <li><a class="nav-link" href="#/shop">Shop</a></li>
              <li><a class="nav-link" href="#/categories">Categories</a></li>
              <li><a class="nav-link" href="#/about">About</a></li>
              <li><a class="nav-link" href="#/contact">Contact</a></li>
              <li><a class="nav-link" href="#/faq">FAQ</a></li>
            </ul>
          </nav>

          <form class="site-header__search search-bar" role="search" aria-label="Search products">
            <input
              type="search"
              name="q"
              placeholder="Search colouring books, markers..."
              aria-label="Search"
              autocomplete="off"
            />
            <button type="submit" class="search-bar__submit" aria-label="Submit search">&#128269;</button>
          </form>
        </div>

        <div class="site-header__actions">
          <a class="icon-link" href="#/wishlist" aria-label="Wishlist">
            &hearts;
            <span class="icon-link__badge" data-badge="wishlist">0</span>
          </a>
          <a class="icon-link" href="#/cart" aria-label="Cart">
            &#128722;
            <span class="icon-link__badge" data-badge="cart">0</span>
          </a>
          <button type="button" class="mobile-toggle site-header__mobile-toggle" aria-label="Open menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>
  `;
}
