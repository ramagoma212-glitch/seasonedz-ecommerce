// Single blog post page. Loads a post by the :slug route param
// supplied by router.js, same pattern as productDetails.js.
//
// Version 7, Milestone 171I: this audit found every blog post's LIVE
// rendered title/description was the router's own generic "Blog |
// Seasonedz Group" fallback (router.js's /blog/:slug entry has no
// per-post data to give it — it can't, the slug isn't known until this
// page itself resolves it) — meaning a post genuinely written to rank
// for a real search (e.g. "Bible colouring books in Sunday school")
// could never actually show that as its title to a JS-executing
// crawler. Fixed the same way productDetails.js already does for
// products: once the real post is known, override the router's
// generic default with the post's own title/description, and add
// BlogPosting structured data — every field here comes straight from
// the post's own existing data, nothing invented.

import { blogPosts } from "../data/blogPosts.js";
import { renderBlogCard } from "../components/blogCard.js";
import { setPageMeta, setPageStructuredData } from "../js/seo.js";

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
      <a class="btn btn--primary" href="/blog">Back to Blog</a>
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
      <a class="btn btn--primary" href="/blog">Back to Blog</a>
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

function buildBlogPostingStructuredData(post) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: new URL(post.image, window.location.origin).href,
    datePublished: post.date,
    url: window.location.href,
    author: { "@type": "Organization", name: "Seasonedz Group" },
    publisher: { "@type": "Organization", name: "Seasonedz Group" },
  };
}

export function renderBlogPost({ slug } = {}) {
  if (!slug) return renderNoPostSelected();

  const post = blogPosts.find((item) => item.slug === slug);
  if (!post) return renderPostNotFound();

  setPageMeta({ title: post.title, description: post.excerpt });
  setPageStructuredData(buildBlogPostingStructuredData(post));

  return `
    <section class="container blog-post">
      <a class="blog-post__back" href="/blog">&larr; Back to Blog</a>

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
        <a class="btn btn--primary" href="${post.relatedLink?.href || "/shop"}">${post.relatedLink?.label || "Shop Now"}</a>
      </div>

      ${renderRelatedPosts(post)}
    </section>
  `;
}
