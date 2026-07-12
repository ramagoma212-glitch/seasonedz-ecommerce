// Reusable category card. Used on the homepage and the categories page.
// Links straight into the shop page, pre-filtered to this category via
// the existing hash-route query string (?category=<slug>).

export function renderCategoryCard(category) {
  return `
    <a class="card category-card" href="#/shop?category=${category.slug}">
      <img class="card__image" src="${category.image}" alt="${category.name}" />
      <div class="card__body">
        <h3 class="card__title">${category.name}</h3>
        <p class="card__subtitle">${category.productCount} product${category.productCount === 1 ? "" : "s"}</p>
        <p class="category-card__desc">${category.description}</p>
      </div>
    </a>
  `;
}
