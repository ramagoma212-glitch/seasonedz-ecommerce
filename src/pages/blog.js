// Blog listing page. Renders every post from data/blogPosts.js as a
// card grid using the shared blogCard component.

import { blogPosts } from "../data/blogPosts.js";
import { renderBlogCard } from "../components/blogCard.js";

export function renderBlog() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Blog</h1>
      <p class="stub-page__text">
        Ideas and tips on educational colouring, mindfulness, Bible
        learning and creativity in the classroom.
      </p>

      <div class="grid grid--3 blog-grid">
        ${blogPosts.map((post) => renderBlogCard(post)).join("")}
      </div>
    </section>
  `;
}
