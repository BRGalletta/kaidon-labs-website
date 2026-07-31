// Shared chat logic for /api/site-demo/*: the system-prompt builder
// (grounded in that session's scraped site content), message builders, and
// the single-call chat turn runner.
//
// Deliberately no tool-use loop and no synthesis step, unlike audit-chat:
// this is one continuous grounded Q&A conversation with no downstream
// structured-extraction consumer, so a plain system-prompt-stuffed chat is
// the right level of complexity — see the approved plan's "Why no tool-use
// loop" section for the full reasoning.

import { getAnthropicClient, MODEL } from "../_lib/anthropic.js";

export { MODEL };
export const MAX_USER_TURNS = 20; // cost backstop against an abandoned-but-open demo tab

export function buildSystemPrompt({ targetUrl, scrapedContent, thin, robotsDisallowed }) {
  const hostname = new URL(targetUrl).hostname.replace(/^www\./, "");

  const contentSection =
    scrapedContent && scrapedContent.trim()
      ? `Here is the content read from ${hostname}'s homepage (and a couple of linked pages, if any were found):\n\n"""\n${scrapedContent}\n"""`
      : `No usable content could be read from ${hostname}'s homepage — it may block automated fetching, or its content may be rendered entirely by JavaScript rather than present in the raw page.`;

  const limitedInfoNote =
    thin || robotsDisallowed || !scrapedContent
      ? `\n\nIMPORTANT: only limited information could be extracted from this site (${
          robotsDisallowed
            ? "its robots.txt asked automated tools not to crawl it"
            : "the page returned very little usable text"
        }). Be upfront if asked something you can't answer from what's above — say plainly that you don't have that information rather than guessing or inventing an answer.`
      : "";

  // This chatbot is shown on a preview page that carries its own persistent,
  // non-dismissible "Demo preview by Kaidon Labs — not affiliated with
  // <site>" banner (see site-demo/preview) — that's the disclosure surface.
  // Inside the conversation itself, the bot should stay fully in character
  // as ${hostname}'s own assistant rather than talking about itself as a
  // demo, so the experience actually feels like what a custom-built chatbot
  // for this business would be like, not a product pitch about one.
  return `You are the AI assistant for ${hostname}. A visitor is chatting with you directly on what looks and feels like ${hostname}'s own website.

${contentSection}${limitedInfoNote}

How to act:
- Fully stay in character as ${hostname}'s assistant. Speak in first person about the business ("we", "our") the way a real assistant embedded on their site would. Don't refer to yourself as a demo, a preview, or an AI chatbot product unless directly and explicitly asked.
- Answer questions about this business using ONLY the content above. Never invent specifics (pricing, hours, addresses, phone numbers, guarantees) that aren't actually in it.
- If something isn't covered by the content above, say so naturally and suggest the visitor check the site directly or contact the business — don't guess, and don't break character to explain why you don't know.
- You can't take real actions (place orders, book appointments, access accounts, process payments) — if asked, explain that you can't do that here but can point them to how the site says to do it.
- If a visitor directly and sincerely asks whether this is real, who built it, or why it exists, don't lie outright — briefly acknowledge this is a live Kaidon Labs demo built from ${hostname}'s public content, then offer to keep going in character. Don't volunteer this unprompted, and don't let a joking or offhand version of the question break character.
- Keep replies conversational and chat-length — a few sentences, not an essay.
- Never mention Kaidon Labs' pricing or make claims about what Kaidon Labs would charge this business — that's a conversation for Brian, not this chat.`;
}

// The opener has no real conversation history yet — this synthetic context
// message (never written into the stored `conversation`) gives the model a
// reason to open with a short, inviting greeting rather than waiting to be
// spoken to first.
export function buildOpenerMessages() {
  return [
    {
      role: "user",
      content:
        "[SYSTEM CONTEXT — not shown to the visitor: this is the very first message of the demo. Greet them warmly, briefly mention you've read through the site, and invite them to ask anything about the business. Keep it short.]",
    },
  ];
}

export function buildMessages(conversation) {
  return conversation.map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: turn.message,
  }));
}

// One Claude call, no tools. Returns the reply text (never empty — falls
// back to a friendly placeholder in the same spirit as audit-chat's
// equivalent fallback, so a quirky/empty model response never reads as the
// chat silently freezing on the frontend).
export async function runChatTurn({ systemPrompt, messages }) {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });
  const replyText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return replyText || "Thanks for your patience — give me just a moment.";
}
