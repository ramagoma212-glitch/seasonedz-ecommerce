// Single blog post page. Loads a post by the :slug route param
// supplied by router.js, same pattern as productDetails.js.

import { blogPosts } from "../data/blogPosts.js";
import { renderBlogCard } from "../components/blogCard.js";

function formatBlogDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderNoPostSelected() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Blog Post</h1>
      <p class="stub-page__text">No blog post was selected.</p>
      <a class="btn btn--primary" href="#/blog">Back to Blog</a>
    </section>
  `;
}

function renderPostNotFound() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Post Not Found</h1>
      <p class="stub-page__text">
        We couldn't find the blog post you were looking for. It may have
        been moved or the link may be incorrect.
      </p>
      <a class="btn btn--primary" href="#/blog">Back to Blog</a>
    </section>
  `;
}

function renderRelatedPosts(post) {
  const related = blogPosts.filter((item) => item.id !== post.id).slice(0, 3);
  if (!related.length) return "";

  return `
    <section class="section blog-post__related">
      <div class="section__header">
        <h2>More From the Blog</h2>
      </div>
      <div class="grid grid--3">
        ${related.map((item) => renderBlogCard(item)).join("")}
      </div>
    </section>
  `;
}

export function renderBlogPost({ slug } = {}) {
  if (!slug) return renderNoPostSelected();

  const post = blogPosts.find((item) => item.slug === slug);
  if (!post) return renderPostNotFound();

  return `
    <section class="container blog-post">
      <a class="blog-post__back" href="#/blog">&larr; Back to Blog</a>

      <article class="blog-post__article">
        <p class="blog-post__meta">${post.category} &bull; ${formatBlogDate(post.date)}</p>
        <h1 class="blog-post__title">${post.title}</h1>

        <img class="blog-post__image" src="${post.image}" alt="${post.title}" />

        <p class="blog-post__intro">${post.excerpt}</p>

        ${post.content.map((paragraph) => `<p>${paragraph}</p>`).join("")}
      </article>

      <div class="info-page__cta">
        <h2>Ready to Explore Our Range?</h2>
        <p>Browse our colouring books, markers and crayons in the shop.</p>
        <a class="btn btn--primary" href="#/shop">Shop Now</a>
      </div>

      ${renderRelatedPosts(post)}
    </section>
  `;
}
