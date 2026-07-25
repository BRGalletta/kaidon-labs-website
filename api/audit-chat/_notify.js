// Sends Brian the internal "new audit chat completed" email via Resend.
// Best-effort: a missing/failing Resend call should never break the
// response the prospect sees — same non-blocking discipline the agency
// skills already use for their Supabase sync.

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "brian@kaidonlabs.com";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderTranscriptHtml(conversation) {
  return conversation
    .map((turn) => `<p><strong>${turn.role === "assistant" ? "Kaidon AI" : "Prospect"}:</strong> ${escapeHtml(turn.message)}</p>`)
    .join("\n");
}

function renderInitiativesHtml(initiatives) {
  return (initiatives || [])
    .map(
      (i) => `<li><strong>${escapeHtml(i.name)}</strong><br/>${escapeHtml(i.why)}${i.evidence ? `<br/><em>Evidence: ${escapeHtml(i.evidence)}</em>` : ""}</li>`
    )
    .join("\n");
}

export async function notifyBrianOfCompletedLead(lead) {
  if (!RESEND_API_KEY) {
    console.error("notify: RESEND_API_KEY not set, skipping email (lead is still saved in Supabase)");
    return { sent: false, reason: "no RESEND_API_KEY" };
  }

  const resend = new Resend(RESEND_API_KEY);
  const extracted = lead.extracted || {};

  const html = `
    <h2>New AI Audit chat completed</h2>
    <p><strong>${escapeHtml(lead.name)}</strong> — ${escapeHtml(lead.company || "no company given")} — ${escapeHtml(lead.email)}</p>

    <h3>Extracted findings</h3>
    <ul>
      <li><strong>Business:</strong> ${escapeHtml(extracted.business_summary)}</li>
      <li><strong>Size/volume:</strong> ${escapeHtml(extracted.size_or_volume_signal)}</li>
      <li><strong>Pain points:</strong> ${escapeHtml((extracted.pain_points || []).join(", "))}</li>
      <li><strong>Pain point cost:</strong> ${escapeHtml(extracted.pain_point_cost)}</li>
      <li><strong>Tools/systems:</strong> ${escapeHtml((extracted.tools_systems_in_use || []).join(", "))}</li>
      <li><strong>What they've tried:</strong> ${escapeHtml(extracted.what_theyve_tried)}</li>
    </ul>

    <h3>Recommended initiatives (internal — fuller than what the prospect saw)</h3>
    <ul>${renderInitiativesHtml(lead.initiatives_internal)}</ul>

    <h3>Suggested audit-fee ballpark (internal only — not shown to the prospect)</h3>
    <p>${escapeHtml(lead.fee_estimate_note)}</p>

    <h3>What the prospect actually saw on-screen</h3>
    <ul>${renderInitiativesHtml(lead.initiatives_prospect)}</ul>

    <h3>Full transcript</h3>
    ${renderTranscriptHtml(lead.conversation || [])}
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Kaidon Labs AI Audit <onboarding@resend.dev>",
      to: NOTIFY_EMAIL,
      subject: `New AI Audit chat: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
      html,
    });

    // The Resend SDK does NOT throw on API-level failures (unverified
    // domain, restricted recipient, invalid from address, etc.) — those
    // come back as `error` on an otherwise-resolved promise. Missing this
    // check means a rejected send looks identical to a successful one.
    if (error) {
      console.error(`notify: Resend rejected the send: ${error.message || JSON.stringify(error)}`);
      return { sent: false, reason: error.message || JSON.stringify(error) };
    }

    console.log(`notify: email sent, Resend id ${data?.id}`);
    return { sent: true, id: data?.id };
  } catch (err) {
    console.error(`notify: Resend send threw: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}
