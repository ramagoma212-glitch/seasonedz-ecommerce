// Cart line-item component: shown on the cart page. Quantity controls
// and the remove button are wired up via delegated handlers in
// js/app.js (data-action="cart-increase" / "cart-decrease" /
// "cart-update" / "cart-remove").

export function renderCartItem(item) {
  const lineTotal = item.price * item.quantity;

  return `
    <div class="cart-item">
      <a class="cart-item__image-link" href="/product/${item.slug}">
        <img class="cart-item__image" src="${item.image}" alt="${item.name}" />
      </a>

      <div class="cart-item__details">
        <a class="cart-item__name" href="/product/${item.slug}">${item.name}</a>
        <p class="cart-item__price">R${item.price.toFixed(2)} each</p>
      </div>

      <div class="cart-item__quantity quantity-selector">
        <button
          type="button"
          class="quantity-selector__btn"
          data-action="cart-decrease"
          data-product-id="${item.productId}"
          aria-label="Decrease quantity of ${item.name}"
        >&minus;</button>
        <input
          type="number"
          class="quantity-selector__input"
          data-action="cart-update"
          data-product-id="${item.productId}"
          value="${item.quantity}"
          min="1"
          aria-label="Quantity of ${item.name}"
        />
        <button
          type="button"
          class="quantity-selector__btn"
          data-action="cart-increase"
          data-product-id="${item.productId}"
          aria-label="Increase quantity of ${item.name}"
        >&plus;</button>
      </div>

      <p class="cart-item__line-total">R${lineTotal.toFixed(2)}</p>

      <button
        type="button"
        class="cart-item__remove"
        data-action="cart-remove"
        data-product-id="${item.productId}"
        aria-label="Remove ${item.name} from cart"
      >&times;</button>
    </div>
  `;
}
