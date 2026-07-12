// Seasonedz Group product categories.
// productCount is derived from products.js rather than hardcoded, so the
// two data files can never drift out of sync as products are added.

import { products } from "./products.js";
import { withBase } from "../js/paths.js";

function countProductsInCategory(categorySlug) {
  return products.filter((product) => product.categorySlug === categorySlug).length;
}

export const categories = [
  {
    id: "kids-colouring-books",
    slug: "kids-colouring-books",
    name: "Kids Colouring Books",
    description: "Fun, educational colouring books for young learners.",
    image: "/images/product-1.jpg",
    get productCount() {
      return countProductsInCategory("kids-colouring-books");
    },
  },
  {
    id: "bible-colouring-books",
    slug: "bible-colouring-books",
    name: "Bible Colouring Books",
    description: "Faith-based colouring books for children and families.",
    image: "/images/product-2.jpg",
    get productCount() {
      return countProductsInCategory("bible-colouring-books");
    },
  },
  {
    id: "mindfulness-colouring",
    slug: "mindfulness-colouring",
    name: "Mindfulness Colouring",
    description: "Calming, therapeutic colouring pages for relaxation.",
    image: "/images/product-3.jpg",
    get productCount() {
      return countProductsInCategory("mindfulness-colouring");
    },
  },
  {
    id: "markers-and-crayons",
    slug: "markers-and-crayons",
    name: "Markers and Crayons",
    description: "Vibrant, safe markers and crayons for creative colouring.",
    image: "/images/product-4.jpg",
    get productCount() {
      return countProductsInCategory("markers-and-crayons");
    },
  },
  {
    id: "bundles",
    slug: "bundles",
    name: "Bundles",
    description: "Colouring books and supplies bundled together at a better price.",
    image: "/images/product-6.jpg",
    get productCount() {
      return countProductsInCategory("bundles");
    },
  },
  {
    id: "schools-and-wholesale",
    slug: "schools-and-wholesale",
    name: "Schools and Wholesale",
    description: "Classroom-ready packs for schools, churches and organisations.",
    image: "/images/product-1.jpg",
    get productCount() {
      return countProductsInCategory("schools-and-wholesale");
    },
  },
].map((category) => ({ ...category, image: withBase(category.image) }));
