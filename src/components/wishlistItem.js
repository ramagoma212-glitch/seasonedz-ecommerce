// Wishlist item card: shown on the wishlist page. Reuses the product
// card's visual language, but with a plain "Remove" button instead of
// a heart toggle, since being on this page already means it's saved.

export function renderWishlistItem(item) {
  return `
    <article class="card wishlist-item">
      <a href="/product/${item.slug}">
        <img class="card__image" src="${item.image}" alt="${item.name}" />
      </a>

      <div class="card__body">
        <p class="product-card__category">${item.category}</p>
        <h3 class="card__title">
          <a href="/product/${item.slug}">${item.name}</a>
        </h3>
        <p class="product-card__price">R${item.price.toFixed(2)}</p>

        <div class="product-card__actions">
          <a class="btn btn--secondary btn--sm" href="/product/${item.slug}">View Details</a>
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-action="add-to-cart"
            data-product-id="${item.productId}"
            data-slug="${item.slug}"
            data-name="${item.name}"
            data-price="${item.price}"
            data-image="${item.image}"
          >Add to Cart</button>
        </div>

        <button
          type="button"
          class="wishlist-item__remove"
          data-action="wishlist-remove"
          data-product-id="${item.productId}"
          aria-label="Remove ${item.name} from wishlist"
        >Remove from Wishlist</button>
      </div>
    </article>
  `;
}
