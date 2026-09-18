// Milestone 188: pure helpers for matching a customer's in-progress
// option selection (e.g. { "Pack Size": "20 Colours" }) against a
// product's real ProductVariant rows. Shared between productDetails.js
// (initial render, from the ?variant= deep link or auto-select-if-only-
// one-variant) and js/app.js (click-driven DOM updates as the customer
// picks options) so both can never compute a different answer for
// "which variant does this selection resolve to."

// Mirrors backend/src/services/adminProductVariant.service.ts's own
// optionValuesKey() field-for-field (sorted keys, so key order never
// matters) so "same combination" can never drift between frontend and
// backend.
export function optionValuesKey(optionValues) {
  return Object.keys(optionValues)
    .sort()
    .map((key) => `${key}=${optionValues[key]}`)
    .join("|");
}

// selection: { [groupName]: value }. Only ever resolves once EVERY
// group has a value chosen — a partial selection never guesses a
// match, matching this project's "never trust/assume, only ever
// resolve a genuine exact combination" discipline.
export function findVariantForSelection(variants, groupNames, selection) {
  if (!groupNames.length || groupNames.some((name) => !selection[name])) return null;
  const key = optionValuesKey(selection);
  return variants.find((variant) => optionValuesKey(variant.optionValues) === key) || null;
}

// Whether choosing `candidateValue` for `groupName`, combined with
// whatever is already picked for every OTHER group, could still
// resolve to a real, in-stock variant — used to grey out an option
// that would otherwise lead to a dead end (an invalid or out-of-stock
// combination).
export function isValueSelectable(variants, groupName, candidateValue, selection) {
  return variants.some((variant) => {
    if (variant.stockQuantity <= 0) return false;
    if (variant.optionValues[groupName] !== candidateValue) return false;
    return Object.entries(selection).every(
      ([otherGroup, value]) => otherGroup === groupName || !value || variant.optionValues[otherGroup] === value
    );
  });
}

// "Pack Size: 20 Colours" — used for cart lines, order display, GA4
// item_variant, and the Merchant feed title. Order follows the
// product's own defined group order (variantOptions), not object key
// order, matching order.service.ts's own buildVariantLabel().
export function buildVariantLabel(optionValues, groupOrder) {
  return groupOrder
    .filter((group) => group.name in optionValues)
    .map((group) => `${group.name}: ${optionValues[group.name]}`)
    .join(", ");
}
