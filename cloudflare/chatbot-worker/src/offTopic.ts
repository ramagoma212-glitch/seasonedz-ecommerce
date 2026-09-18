// Milestone 187, Part K: a small, deliberately narrow pre-filter for
// the *obvious* off-topic requests named in the brief itself (write my
// assignment, world news, write code, politics, homework, unrelated
// business advice) — this exists only to save AI allocation on the
// clearest cases, not to be an exhaustive blocklist. Anything
// ambiguous is deliberately left to the AI itself, which carries its
// own "stay in Seasonedz scope" system instruction (see
// systemPrompt.ts) — a broad or brittle keyword list here would risk
// wrongly blocking a genuine Seasonedz question that happens to share
// a word with one of these phrases.
const OBVIOUS_OFF_TOPIC_PATTERNS: RegExp[] = [
  /\bwrite (my|an?|this) (assignment|essay|homework|thesis)\b/i,
  /\bwrite (some |the )?(code|a program|a script|an? (function|algorithm))\b/i,
  /\b(world news|latest news|current events)\b/i,
  /\b(us|uk|world) (politics|election)\b/i,
  /\bwho (won|is winning) the election\b/i,
  /\bstock market (advice|tips|prediction)\b/i,
  /\bwrite (my|a) (cv|resume|cover letter)\b/i,
];

export function isObviouslyOffTopic(text: string): boolean {
  return OBVIOUS_OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
}

export const OFF_TOPIC_REPLY =
  "I can help with Seasonedz Group products, orders, delivery and website questions.";
