// POST /api/site-demo/chat
// Body: { session_id, message }
// One grounded chat turn: appends the visitor's message, rebuilds the exact
// same system prompt used at capture time (from the session's stored
// scraped content + thin/robots flags), makes a single Claude call, appends
// the reply, and returns it. Caps total turns as a cost backstop against an
// abandoned-but-open demo tab — mirrors audit-chat/message.js's shape, but
// with no tool-use loop and no synthesis step (see _shared.js for why).

import { supabaseFetch } from "../_lib/supabase.js";
import { buildSystemPrompt, buildMessages, runChatTurn, MAX_USER_TURNS } from "./_shared.js";

export const maxDuration = 30;

const WRAP_UP_MESSAGE =
  "We've covered a lot here! If you'd like to keep exploring what a custom AI assistant could do for this business, book a quick call with Kaidon Labs.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { session_id: sessionId, message } = req.body || {};
  if (!sessionId || !message) {
    res.status(400).json({ error: "session_id and message are required" });
    return;
  }

  try {
    const [session] = await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}&select=*`);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.status !== "ready") {
      res.status(409).json({ error: "This demo isn't ready yet." });
      return;
    }

    const conversation = [
      ...(session.conversation || []),
      { role: "user", message, timestamp: new Date().toISOString() },
    ];

    const userTurnCount = conversation.filter((t) => t.role === "user").length;
    if (userTurnCount > MAX_USER_TURNS) {
      res.status(200).json({ message: WRAP_UP_MESSAGE, turn_limit_reached: true });
      return;
    }

    const systemPrompt = buildSystemPrompt({
      targetUrl: session.target_url,
      scrapedContent: session.scraped_content,
      thin: session.content_thin,
      robotsDisallowed: session.robots_disallowed,
    });

    const replyText = await runChatTurn({ systemPrompt, messages: buildMessages(conversation) });
    conversation.push({ role: "assistant", message: replyText, timestamp: new Date().toISOString() });

    await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}`, {
      method: "PATCH",
      body: { conversation, updated_at: new Date().toISOString() },
    });

    res.status(200).json({ message: replyText });
  } catch (err) {
    console.error(`site-demo/chat: ${err.message}`);
    res.status(500).json({ error: "Something went wrong continuing the chat. Please try again in a moment." });
  }
}
