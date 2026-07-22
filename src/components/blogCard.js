// Reusable blog post card. Used on the blog listing page and the
// related-posts section of the blog post page.

function formatBlogDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Version 7, Milestone 92A: see productCard.js's comment for the
// eager/width/height reasoning — same pattern here.
export function renderBlogCard(post, { eager = false } = {}) {
  return `
    <article class="card blog-card">
      <a href="/blog/${post.slug}">
        <img
          class="card__image"
          src="${post.image}"
          alt="${post.title}"
          width="400"
          height="400"
          loading="${eager ? "eager" : "lazy"}"
          decoding="async"
        />
      </a>
      <div class="card__body">
        <p class="blog-card__meta">${post.category} &bull; ${formatBlogDate(post.date)}</p>
        <h3 class="card__title">
          <a href="/blog/${post.slug}">${post.title}</a>
        </h3>
        <p class="blog-card__excerpt">${post.excerpt}</p>
        <a class="blog-card__link" href="/blog/${post.slug}">Read More &rarr;</a>
      </div>
    </article>
  `;
}
