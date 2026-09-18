// Seasonedz AI Customer Assistant — Cloudflare Worker (Milestone 187).
// Isolated from the Render backend entirely — no Prisma, no Supabase,
// no order/customer/affiliate data ever touches this file. See this
// milestone's own final report for the full architecture and audit.
import type { Env, ChatMessage, ChatRequestBody } from "./types";
import { isAllowedOrigin, corsHeaders } from "./cors";
import { isValidVisitorId } from "./visitorId";
import { containsSensitiveInfo } from "./sensitiveData";
import { isObviouslyOffTopic, OFF_TOPIC_REPLY } from "./offTopic";
import { verifyTurnstileToken } from "./turnstile";
import { getJohannesburgDate, getUsageCount, incrementUsage, DAILY_LIMIT, nextJohannesburgDate } from "./usage";
import { getTrustedContext } from "./trustedContext";
import { buildSystemPrompt } from "./systemPrompt";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const MAX_MESSAGE_LENGTH = 600;
const MAX_HISTORY_EXCHANGES = 3; // last 3 user/assistant pairs, never the whole day's conversation
const SENSITIVE_INFO_REPLY = "For your privacy, please do not send passwords, card details, OTPs, ID numbers or other sensitive personal information in this chat.";
const SUPPORT_FALLBACK_REPLY = "Our AI assistant is temporarily unavailable. Please contact Seasonedz Group for help.";
const TURNSTILE_FAILED_REPLY = "We couldn't verify your request. Please try again.";

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function sanitiseHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  const valid = history.filter(
    (entry): entry is ChatMessage =>
      entry &&
      typeof entry === "object" &&
      (entry.role === "user" || entry.role === "assistant") &&
      typeof entry.content === "string" &&
      entry.content.length <= MAX_MESSAGE_LENGTH
  );
  // Last N exchanges = last 2*N messages (Part N: "last 3 assistant/user exchanges").
  return valid.slice(-MAX_HISTORY_EXCHANGES * 2);
}

async function handleChat(request: Request, env: Env, origin: string): Promise<Response> {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 400, origin);
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400, origin);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return jsonResponse({ error: "Message is required." }, 400, origin);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` }, 400, origin);
  }
  if (!isValidVisitorId(body.visitorId)) {
    return jsonResponse({ error: "Invalid visitor id." }, 400, origin);
  }
  if (typeof body.turnstileToken !== "string" || !body.turnstileToken) {
    return jsonResponse({ error: "Turnstile verification is required." }, 400, origin);
  }

  // Part D/X: Turnstile is verified before anything else costs AI
  // allocation or counts toward the daily limit.
  const turnstileOk = await verifyTurnstileToken(body.turnstileToken, env.TURNSTILE_SECRET_KEY, request.headers.get("CF-Connecting-IP"));
  if (!turnstileOk) {
    return jsonResponse({ reply: TURNSTILE_FAILED_REPLY, remaining: null, blocked: true }, 200, origin);
  }

  // Part L: obvious sensitive info never reaches Workers AI, is never
  // logged, and never consumes a reply.
  if (containsSensitiveInfo(message)) {
    return jsonResponse({ reply: SENSITIVE_INFO_REPLY, remaining: null, blocked: true }, 200, origin);
  }

  const date = getJohannesburgDate();
  const currentCount = await getUsageCount(env, body.visitorId, date);
  if (currentCount >= DAILY_LIMIT) {
    return jsonResponse(
      {
        reply: "You have reached today's 7 AI replies. You can continue tomorrow or contact Seasonedz Group for help.",
        remaining: 0,
        resetDate: nextJohannesburgDate(date),
        limitReached: true,
      },
      200,
      origin
    );
  }

  // Part K: an obvious off-topic message gets the fixed redirect reply
  // without spending any AI allocation, and does not consume a reply
  // (it never reached Workers AI, and Part K frames this the same as
  // any other non-answer — only a successful AI answer to a real
  // Seasonedz question consumes one of the 7).
  if (isObviouslyOffTopic(message)) {
    return jsonResponse({ reply: OFF_TOPIC_REPLY, remaining: DAILY_LIMIT - currentCount, resetDate: date }, 200, origin);
  }

  const trustedContext = await getTrustedContext();
  const systemPrompt = buildSystemPrompt(trustedContext);
  const history = sanitiseHistory(body.history);

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history,
    { role: "user" as const, content: message },
  ];

  let aiReply: string | null = null;
  try {
    const result = (await env.AI.run(MODEL, {
      messages,
      max_tokens: 220,
      temperature: 0.2,
    })) as { response?: string; choices?: { message?: { content?: string } }[] };

    aiReply = result.response ?? result.choices?.[0]?.message?.content ?? null;
  } catch {
    aiReply = null;
  }

  if (!aiReply || !aiReply.trim()) {
    // Part Y: no valid AI response — never consume a reply, never
    // retry automatically, never fall back to a paid provider.
    return jsonResponse({ reply: SUPPORT_FALLBACK_REPLY, remaining: DAILY_LIMIT - currentCount, resetDate: date, aiUnavailable: true }, 200, origin);
  }

  const newCount = await incrementUsage(env, body.visitorId, date, currentCount);
  return jsonResponse(
    {
      reply: aiReply.trim(),
      remaining: Math.max(0, DAILY_LIMIT - newCount),
      resetDate: date,
    },
    200,
    origin
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const environment = env.ENVIRONMENT || "production";

    if (url.pathname === "/health") {
      // Part B: never calls Workers AI — a minimal, unauthenticated
      // liveness response only.
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "OPTIONS") {
      if (origin && isAllowedOrigin(origin, environment)) {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      return new Response(null, { status: 403 });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      if (!origin || !isAllowedOrigin(origin, environment)) {
        return jsonResponse({ error: "Origin not allowed." }, 403, null);
      }
      try {
        return await handleChat(request, env, origin);
      } catch {
        return jsonResponse({ reply: SUPPORT_FALLBACK_REPLY, remaining: null }, 500, origin);
      }
    }

    return jsonResponse({ error: "Not found." }, 404, origin);
  },
};
