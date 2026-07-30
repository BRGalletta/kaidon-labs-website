// POST /api/audit-chat/message
// Body: { session_id, message }
// Appends the prospect's message, runs one conversation turn (with inline
// update_findings extraction), and either returns the next assistant reply
// or — once the model signals readiness or the turn cap is hit — runs
// synthesis, saves both initiative sets, fires the Brian notification
// email, and returns the no-pricing teaser result for the prospect.

import {
  getAnthropicClient,
  supabaseFetch,
  buildMessages,
  runConversationTurn,
  synthesizeInitiatives,
  MAX_USER_TURNS,
} from "./_shared.js";
import { notifyBrianOfCompletedLead } from "./_notify.js";

// The most latency-sensitive route: a conversation turn plus, on the final
// turn, a synthesis call too — up to 3 sequential Claude calls in the worst
// case. If your plan's max is lower than this, Vercel will say so at
// deploy time — lower the number to match rather than removing it.
export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { session_id, message } = req.body || {};
  if (!session_id || !message) {
    res.status(400).json({ error: "session_id and message are required" });
    return;
  }

  try {
    const [lead] = await supabaseFetch(`website_audit_leads?id=eq.${session_id}&select=*`);
    if (!lead) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Idempotent: if this session already finished (e.g. a retried request),
    // just hand back the stored result instead of re-running synthesis.
    if (lead.status === "completed") {
      const lastAssistantTurn = [...(lead.conversation || [])].reverse().find((t) => t.role === "assistant");
      res.status(200).json({
        done: true,
        message: lastAssistantTurn?.message || "Here's what I found:",
        initiatives: lead.initiatives_prospect || [],
      });
      return;
    }

    const conversation = [
      ...(lead.conversation || []),
      { role: "user", message, timestamp: new Date().toISOString() },
    ];
    const userTurnCount = conversation.filter((t) => t.role === "user").length;

    const client = getAnthropicClient();
    const messages = buildMessages(lead, conversation);
    const { replyText, extracted, readyForSynthesis } = await runConversationTurn({
      client,
      messages,
      extracted: lead.extracted || {},
    });

    if (replyText) {
      conversation.push({ role: "assistant", message: replyText, timestamp: new Date().toISOString() });
    }

    const hitTurnCap = userTurnCount >= MAX_USER_TURNS;
    const done = readyForSynthesis || hitTurnCap;

    if (!done) {
      await supabaseFetch(`website_audit_leads?id=eq.${lead.id}`, {
        method: "PATCH",
        body: { conversation, extracted, updated_at: new Date().toISOString() },
      });
      res.status(200).json({ done: false, message: replyText });
      return;
    }

    const synthesis = await synthesizeInitiatives({ client, extracted });

    const updatedLead = {
      ...lead,
      conversation,
      extracted,
      initiatives_prospect: synthesis.prospect,
      initiatives_internal: synthesis.internal,
      fee_estimate_note: synthesis.fee_estimate_note,
      qualification_signal: synthesis.qualification_signal,
    };

    await supabaseFetch(`website_audit_leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: {
        conversation,
        extracted,
        status: "completed",
        initiatives_prospect: synthesis.prospect,
        initiatives_internal: synthesis.internal,
        updated_at: new Date().toISOString(),
      },
    });

    // Best-effort — never let a notification failure affect what the
    // prospect sees. notifyBrianOfCompletedLead already swallows its own errors.
    await notifyBrianOfCompletedLead(updatedLead);

    const wrapUpMessage = replyText || "Thanks for sharing all that — here's what I found:";
    res.status(200).json({ done: true, message: wrapUpMessage, initiatives: synthesis.prospect });
  } catch (err) {
    console.error(`audit-chat/message: ${err.message}`);
    res.status(500).json({ error: "Something went wrong continuing the chat. Please try again in a moment." });
  }
}
