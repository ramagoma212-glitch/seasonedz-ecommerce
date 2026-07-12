// Small, safe wrapper around Local Storage.
// Every read/write is guarded so a missing key, corrupted JSON, or an
// unavailable Local Storage (private browsing, quota exceeded) never
// throws — callers always get a predictable value back.

export function getStorageItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local Storage may be unavailable or full — fail silently rather
    // than breaking the page.
  }
}

export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Resets a single key back to "empty". Used by the cart/wishlist
// "Clear" actions. Kept as its own named function (rather than reusing
// removeStorageItem directly at every call site) so those call sites
// read clearly for what they mean to do.
export function clearStorageItem(key) {
  removeStorageItem(key);
}
