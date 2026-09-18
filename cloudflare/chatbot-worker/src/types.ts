export interface Env {
  AI: Ai;
  CHATBOT_USAGE: KVNamespace;
  ENVIRONMENT: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  visitorId: string;
  turnstileToken: string;
}
