// Seasonedz AI Customer Assistant widget shell (Milestone 187, Part O).
// Pure presentation for the STATIC parts only — the launcher, panel
// chrome, composer, quick questions, and the deterministic welcome
// message (all fixed, known-safe strings this project already
// controls). Dynamic content — every real chat message, both the
// customer's own text and the AI's reply — is appended separately via
// safe DOM APIs (textContent, never innerHTML) in js/app.js's own
// chat-message renderer; see that file's renderChatMessageBubble()
// for why (Part U: never let model output execute as HTML).

import { businessInfo } from "../data/businessInfo.js";

const WELCOME_MESSAGE =
  "Hi, I'm the Seasonedz Assistant. I can help with our products, delivery, preorders and website questions.\n\nPlease don't share passwords, card details or other sensitive personal information.\n\nYou have 7 AI replies available today.";

const QUICK_QUESTIONS = ["What products do you have?", "How much is delivery?", "Do you have colouring books for adults?", "How do preorders work?"];

export function renderChatWidget() {
  return `
    <div class="chat-widget" data-chat-widget hidden>
      <button
        type="button"
        class="chat-widget__launcher"
        data-action="toggle-chat-widget"
        aria-expanded="false"
        aria-controls="seasonedzChatPanel"
      >
        <span class="chat-widget__launcher-icon" aria-hidden="true">&#128172;</span>
        <span class="chat-widget__launcher-label">Ask Seasonedz</span>
      </button>

      <div id="seasonedzChatPanel" class="chat-widget__panel" role="dialog" aria-labelledby="chatWidgetTitle" hidden>
        <div class="chat-widget__header">
          <h2 id="chatWidgetTitle" class="chat-widget__title">Seasonedz Assistant</h2>
          <button type="button" class="chat-widget__close" data-action="close-chat-widget" aria-label="Close chat">&times;</button>
        </div>

        <div class="chat-widget__messages" data-chat-messages role="log" aria-live="polite" aria-label="Chat messages">
          <div class="chat-widget__bubble chat-widget__bubble--assistant" data-chat-welcome>${WELCOME_MESSAGE
            .split("\n\n")
            .map((line) => `<p>${line}</p>`)
            .join("")}</div>
        </div>

        <div class="chat-widget__quick-questions" data-chat-quick-questions>
          ${QUICK_QUESTIONS.map((question) => `<button type="button" class="chat-widget__quick-question" data-chat-quick-question="${question}">${question}</button>`).join("")}
        </div>

        <div class="chat-widget__turnstile" data-chat-turnstile-container></div>

        <p class="chat-widget__status" data-chat-status aria-live="polite">7 replies available today</p>

        <form class="chat-widget__composer" data-chat-composer>
          <label for="chatWidgetInput" class="visually-hidden">Type your message to the Seasonedz Assistant</label>
          <textarea
            id="chatWidgetInput"
            class="chat-widget__input"
            maxlength="600"
            rows="2"
            placeholder="Ask about products, delivery, preorders..."
            data-chat-input
          ></textarea>
          <button type="submit" class="btn btn--primary btn--sm chat-widget__send" data-chat-send>Send</button>
        </form>

        <div class="chat-widget__limit-reached" data-chat-limit-reached hidden>
          <p>You have reached today's 7 AI replies. You can use the assistant again tomorrow.</p>
          <p>Need more help?</p>
          <div class="chat-widget__support-links">
            <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a href="/contact">Contact Us</a>
            <a href="/track-order">Order Tracking</a>
          </div>
        </div>

        <button type="button" class="chat-widget__clear" data-action="clear-chat">Clear chat</button>
      </div>
    </div>
  `;
}
