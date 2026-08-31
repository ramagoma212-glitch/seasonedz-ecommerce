// Milestone 178 UI polish add-on: clean, minimal, monochrome vector
// icons for the social/contact strip — replaces the earlier plain
// Unicode emoji glyphs (👍/📷/🎵/💼/👽/✖/💬/✉️/📞/❓). No icon library
// is installed in this project (checked package.json), and the owner's
// brief explicitly rules out adding one just for these — so each icon
// is a small, original, hand-drawn inline SVG built from simple
// primitives (circle/rect/line/path), monoline "stroke" style, always
// `stroke="currentColor"` so the surrounding CSS controls colour, never
// a hardcoded brand colour (no Facebook blue, no Instagram gradient,
// etc. — the brief's own explicit rule). A filled dot/shape inside a
// couple of icons uses `fill="currentColor"` for the same reason.
//
// Every icon shares one 24x24 viewBox and one visual weight, so
// swapping between them inside the same circular container (see
// .social-icon-circle in css/components.css) never looks uneven.

const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const SOCIAL_ICONS = {
  facebook: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><path d="M16 8h-2a2 2 0 0 0-2 2v10M9 12h5"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="16.5" cy="7.5" r="0.8" fill="currentColor" stroke="none"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><circle cx="10" cy="16" r="3"/><path d="M13 16V5a4 4 0 0 0 4 4"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><path d="M5 5l14 14M19 5L5 19"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><rect x="4" y="4" width="16" height="16" rx="3"/><line x1="8" y1="10" x2="8" y2="17"/><circle cx="8" cy="7" r="0.6" fill="currentColor" stroke="none"/><path d="M12 17v-4a2.5 2.5 0 0 1 5 0v4"/><line x1="12" y1="10" x2="12" y2="17"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><circle cx="12" cy="13" r="6"/><circle cx="8.5" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M9 16c1 1 2 1.3 3 1.3s2-.3 3-1.3"/><circle cx="12" cy="5.5" r="1.5"/><line x1="12" y1="7" x2="12" y2="9"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M8.6 9.6c0 3.8 2.9 6.2 5.7 6.2.7 0 1-.6 1-1.2 0-.3-.1-.5-.4-.6l-1.5-.8a.7.7 0 0 0-.8.2l-.4.4a5.4 5.4 0 0 1-2.5-2.5l.4-.4a.7.7 0 0 0 .2-.8l-.8-1.5a.6.6 0 0 0-.6-.4c-.6 0-1.3.4-1.3 1.4z" fill="currentColor" stroke="none"/></svg>`,
  email: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>`,
  faq: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.6-1.4c.6.9.4 1.7-.3 2.3l-.8.7a2 2 0 0 0-.7 1.6v.3"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>`,
  location: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" ${STROKE_ATTRS}><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.2"/></svg>`,
};

// Wraps an icon in the shared circular container — every place this
// social/contact group appears (footer, Contact page) uses this same
// function, so the circle size/border/colour can never drift between
// them (brief section 10: "must feel like the same design system").
export function renderIconCircle(key) {
  const icon = SOCIAL_ICONS[key];
  return `<span class="social-icon-circle" aria-hidden="true">${icon || ""}</span>`;
}
