// Site footer component: company description, quick links, business
// links, customer service links, contact placeholder and copyright.

export function renderFooter() {
  const year = new Date().getFullYear();

  return `
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <div class="site-footer__col">
          <h3 class="footer-heading">Seasonedz Group</h3>
          <p class="footer-description">
            Educational colouring books, Bible colouring books, mindfulness
            colouring books, markers, crayons and educational products for
            parents, teachers, schools and churches.
          </p>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Quick Links</h4>
          <ul class="footer-links">
            <li><a href="#/shop">Shop</a></li>
            <li><a href="#/categories">Categories</a></li>
            <li><a href="#/about">About Us</a></li>
            <li><a href="#/blog">Blog</a></li>
            <li><a href="#/testimonials">Testimonials</a></li>
            <li><a href="#/contact">Contact</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">For Business</h4>
          <ul class="footer-links">
            <li><a href="#/schools">Schools</a></li>
            <li><a href="#/wholesale">Wholesale</a></li>
            <li><a href="#/distributor">Distributors</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Customer Service</h4>
          <ul class="footer-links">
            <li><a href="#/track-order">Track Order</a></li>
            <li><a href="#/faq">FAQ</a></li>
            <li><a href="#/shipping-policy">Shipping Policy</a></li>
            <li><a href="#/returns-policy">Returns Policy</a></li>
            <li><a href="#/privacy-policy">Privacy Policy</a></li>
            <li><a href="#/terms">Terms &amp; Conditions</a></li>
            <li><a href="#/cookies-policy">Cookies Policy</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Contact Us</h4>
          <ul class="footer-links">
            <li>Email: hello@seasonedzgroup.com</li>
            <li>Phone: +27 00 000 0000</li>
            <li>South Africa</li>
          </ul>
        </div>
      </div>

      <div class="site-footer__bottom">
        &copy; ${year} Seasonedz Group. All rights reserved.
      </div>
    </footer>
  `;
}
