// Backend-only constants for Milestone 177's brand writing rule (no
// decorative em/en dash in customer/admin-facing copy). This is a
// separate package from the frontend, so this is not literally shared
// with tests/smoke/copyAudit.spec.js's own frontend logic — it exists
// so every backend caller (currently only qualityCheck.service.ts)
// references one definition instead of repeating the literal
// characters.

export const EM_DASH = "—";
export const EN_DASH = "–";
