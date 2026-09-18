// Seasonedz AI Customer Assistant — frontend logic (Milestone 187).
// Talks only to the dedicated Cloudflare Worker (cloudflare/chatbot-worker/)
// — never Render, never Supabase, never any Seasonedz backend endpoint.
// See that Worker's own README/comments for the server-side half of
// this feature.
//
// Config-gated exactly like js/analytics.js's own Measurement-ID gate:
// without both VITE_CHATBOT_API_URL and VITE_TURNSTILE_SITE_KEY set,
// isChatbotConfigured() is false and the widget never renders at all —
// never a broken/non-functional chat button in production.

const API_URL = (import.meta.env.VITE_CHATBOT_API_URL || "").trim();
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();

const VISITOR_ID_KEY = "seasonedz_chat_visitor_id";
const HISTORY_KEY = "seasonedz_chat_history"; // sessionStorage — Part N: never permanent
const DAILY_LIMIT = 7;
const MAX_MESSAGE_LENGTH = 600;

export function isChatbotConfigured() {
  return Boolean(API_URL) && Boolean(TURNSTILE_SITE_KEY);
}

// Part E: a random anonymous identifier only — never derived from any
// personal information, stored in localStorage so it's stable across a
// return visit (clearing browser storage resets it — a known,
// deliberately-not-hidden limitation, see this milestone's own final
// report).
export function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, fresh);
    return fresh;
  } catch {
    // Local Storage unavailable (private browsing, quota) — a fresh
    // id per call still lets the chat work for this one exchange, just
    // without persistence across a reload.
    return crypto.randomUUID();
  }
}

// Part N: sessionStorage only, and only ever the small trimmed window
// actually sent to the Worker — never the customer's Local Storage,
// never permanent.
export function getChatHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setChatHistory(history) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Session Storage unavailable — chat still works for this message,
    // it just won't remember it for the next one.
  }
}

export function appendToHistory(role, content) {
  const history = getChatHistory();
  history.push({ role, content });
  // Keep only the last 3 exchanges (6 messages) — Part N: never send
  // the whole day's conversation repeatedly.
  const trimmed = history.slice(-6);
  setChatHistory(trimmed);
  return trimmed;
}

export function clearChatHistory() {
  try {
    sessionStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

// --- Turnstile -----------------------------------------------------

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let turnstileScriptPromise = null;
let turnstileWidgetId = null;
let pendingTokenResolve = null;
let pendingTokenReject = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load."));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

// Part AC: lazily loaded — only called once the visitor actually opens
// the chat panel, never on page load. Renders once into the given
// container and is reused (reset) for every subsequent message in the
// session, since a Turnstile token is single-use.
export async function ensureTurnstileWidget(containerEl) {
  if (!isChatbotConfigured()) throw new Error("Chatbot not configured.");
  await loadTurnstileScript();

  if (turnstileWidgetId !== null) return;

  turnstileWidgetId = window.turnstile.render(containerEl, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: (token) => {
      if (pendingTokenResolve) pendingTokenResolve(token);
      pendingTokenResolve = null;
      pendingTokenReject = null;
    },
    "error-callback": () => {
      if (pendingTokenReject) pendingTokenReject(new Error("Turnstile verification failed."));
      pendingTokenResolve = null;
      pendingTokenReject = null;
    },
    "expired-callback": () => {
      if (pendingTokenReject) pendingTokenReject(new Error("Turnstile token expired."));
      pendingTokenResolve = null;
      pendingTokenReject = null;
    },
  });
}

function getTurnstileToken() {
  return new Promise((resolve, reject) => {
    if (turnstileWidgetId === null || !window.turnstile) {
      reject(new Error("Turnstile not ready."));
      return;
    }
    pendingTokenResolve = resolve;
    pendingTokenReject = reject;
    try {
      window.turnstile.reset(turnstileWidgetId);
      window.turnstile.execute(turnstileWidgetId);
    } catch (error) {
      pendingTokenResolve = null;
      pendingTokenReject = null;
      reject(error);
    }
  });
}

// --- Sending a message ----------------------------------------------

// Never throws — every failure path (Turnstile, network, the Worker's
// own error responses) resolves to a normal { reply, ... } shape so
// the UI never needs a separate catch branch for "something broke" vs
// "the assistant said no". Part X/Y: none of these consume a reply.
export async function sendChatMessage(message) {
  if (!isChatbotConfigured()) {
    return { reply: "Our AI assistant is temporarily unavailable. Please contact Seasonedz Group for help.", remaining: null, unavailable: true };
  }
  const trimmed = (message || "").trim();
  if (!trimmed) return { reply: "", remaining: null, skipped: true };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { reply: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`, remaining: null, blocked: true };
  }

  let turnstileToken;
  try {
    turnstileToken = await getTurnstileToken();
  } catch {
    return { reply: "We couldn't verify your request. Please try again.", remaining: null, blocked: true };
  }

  const history = getChatHistory();

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed, history, visitorId: getVisitorId(), turnstileToken }),
    });
    if (!response.ok) {
      return { reply: "Our AI assistant is temporarily unavailable. Please contact Seasonedz Group for help.", remaining: null, unavailable: true };
    }
    const data = await response.json();
    return data;
  } catch {
    return { reply: "Our AI assistant is temporarily unavailable. Please contact Seasonedz Group for help.", remaining: null, unavailable: true };
  }
}

export const CHAT_DAILY_LIMIT = DAILY_LIMIT;
