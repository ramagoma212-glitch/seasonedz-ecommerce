# Seasonedz Group — E-commerce Website

A professional, scalable e-commerce website for **Seasonedz Group**, a
business selling educational colouring books, Bible colouring books,
mindfulness colouring books, markers, crayons and educational products
for parents, teachers, schools and churches.

This is a **frontend-only** project built with plain HTML5, CSS3 and
JavaScript ES Modules, powered by [Vite](https://vitejs.dev/). There is
no backend, database, authentication or payment integration yet.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`) — open it
in your browser.

### Other scripts

```bash
npm run build     # Build a production bundle into /dist
npm run preview   # Preview the production build locally
```

## Folder Structure

```
seasonedz-ecommerce/
  public/
    images/              Static images (logo, hero banner, product photos)

  src/
    css/                 Global stylesheets (design tokens, layout, components,
                          page styles, responsive breakpoints)
    data/                 Sample/placeholder data (products, categories, FAQs,
                          testimonials, blog posts) — will be swapped for real
                          data later without changing any page/component code
    js/                   Core application logic
      app.js               Entry point — mounts header/footer and starts the router
      router.js             Simple hash-based router mapping URLs to pages
      storage.js            localStorage helper
      cart.js, wishlist.js, search.js, checkout.js, validation.js, orders.js
                             Placeholder modules for future functionality
    components/            Reusable, render-a-string UI pieces (header, footer,
                          product/category cards, cart/wishlist items, order summary)
    pages/                  One module per route, each exporting a render() function

  index.html
  package.json
  README.md
```

## What's Included in Milestone 1

- Vite project set up and running (`npm install` + `npm run dev`)
- Full folder structure to support future e-commerce features
- Global CSS with design tokens (colours, font sizes, spacing, radius,
  shadows, container width, header height, breakpoints)
- A warm, clean, professional design direction suited to an educational
  brand
- Reusable header (logo, nav, search placeholder, wishlist/cart links,
  mobile menu button) and footer (company description, quick links,
  customer service links, contact placeholder, copyright)
- A simple client-side router and page-rendering structure — every page
  in the folder structure is already reachable via navigation
- A homepage with hero, welcome message, and placeholder sections for
  categories, featured products, schools/wholesale and customer trust
- Placeholder images and sample data for products, categories, FAQs,
  testimonials and blog posts

## What's Not Included Yet

Cart, wishlist, search, checkout and order tracking are stubbed out on
purpose — the pages and modules exist so the app is easy to extend, but
none of the logic is implemented yet.

## Future Milestones

- Product catalog, filtering and product detail pages
- Search
- Shopping cart and wishlist functionality
- Guest checkout flow and order confirmation
- Order tracking
- PayFast payment integration
- Courier/shipping integration
- Customer accounts
- Admin dashboard
