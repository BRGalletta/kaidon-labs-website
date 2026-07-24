// POST /api/audit-chat/start
// Body: { name, email, company }
// Creates the Supabase lead row, gets the model's personalized opener, and
// returns { session_id, message }. Includes a light per-email daily abuse
// guard — intentionally simple, not a full rate-limiting system.

import { getAnthropicClient, supabaseFetch, buildMessages, runConversationTurn } from "./_shared.js";

const DAILY_SUBMISSION_CAP_PER_EMAIL = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { name, email, company } = req.body || {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }

  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const existingToday = await supabaseFetch(
      `website_audit_leads?email=eq.${encodeURIComponent(email)}&created_at=gte.${todayIso}&select=id`
    );
    if (existingToday.length >= DAILY_SUBMISSION_CAP_PER_EMAIL) {
      res.status(429).json({
        error: "You've already started a few of these today — please book a call directly instead.",
      });
      return;
    }

    const [lead] = await supabaseFetch("website_audit_leads", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [{ name, email, company: company || null, conversation: [], extracted: {}, status: "in_progress" }],
    });

    const client = getAnthropicClient();
    const messages = buildMessages(lead, []);
    const { replyText, extracted } = await runConversationTurn({ client, messages, extracted: {} });

    const conversation = [{ role: "assistant", message: replyText, timestamp: new Date().toISOString() }];

    await supabaseFetch(`website_audit_leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: { conversation, extracted, updated_at: new Date().toISOString() },
    });

    res.status(200).json({ session_id: lead.id, message: replyText });
  } catch (err) {
    console.error(`audit-chat/start: ${err.message}`);
    res.status(500).json({ error: "Something went wrong starting the chat. Please try again in a moment." });
  }
}
