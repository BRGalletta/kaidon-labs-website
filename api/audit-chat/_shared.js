// Shared helpers for the /api/audit-chat/* serverless functions: the
// conversation system prompt and the tool schema used for inline
// structured-data extraction. The generic Anthropic-client and Supabase-fetch
// helpers live in api/_lib/ so sibling features (e.g. site-demo) don't need
// to reach into this feature-specific file to get them.

export { getAnthropicClient, MODEL, setTestFetchOverride } from "../_lib/anthropic.js";
export { supabaseFetch } from "../_lib/supabase.js";

export const MAX_USER_TURNS = 8; // hard backstop even if the model never sets ready_for_synthesis
// Kept small on purpose: each iteration is a sequential live Claude call within
// one Vercel function invocation, and Vercel's per-request timeout (as low as
// 10s on some plans) is easy to blow through with 3+ round trips as the
// conversation's context grows. The system prompt now tells the model to always
// reply in the same turn as any tool call, so this should rarely exceed 1.
export const MAX_TOOL_LOOP_ITERATIONS = 2;

export const SYSTEM_PROMPT = `You are the AI intake conversation for Kaidon Labs, a practical AI consulting agency (founder: Brian Galletta). A prospect just landed on the "AI Audit" page of the Kaidon Labs website and is chatting with you directly — there is no human in this conversation yet.

Kaidon Labs' four core service areas — the concrete things we build for clients — are:
1. RAG Agents — AI assistants grounded in a business's own documents/data (support, internal knowledge, customer-facing Q&A).
2. Lead Gen Automations — AI-driven outreach, qualification, and follow-up systems for sales pipelines.
3. Voice Agents — AI phone/voice assistants for calls, scheduling, intake, and support.
4. Content Automations — AI-assisted content creation and publishing workflows.
If the prospect asks what Kaidon Labs does, answer honestly using these four areas. Otherwise, keep them in the back of your mind as you listen — they're useful signal for what to probe on — but don't recite the list unprompted and don't force a pain point into one of these buckets if it doesn't genuinely fit.

Your job: have a warm, genuinely curious conversation to understand their business well enough to name a couple of concrete places AI could help. This is NOT a form with questions to march through — it's a real conversation that adapts to what they actually say.

What you're trying to learn (skip anything they've already told you, don't ask twice):
- What the business actually does, and roughly its size/volume (team size, order volume, customer count — whatever signal is natural to ask for)
- Their real pain points — and the cost of each one if you can get it (hours/week, dollars, errors, missed opportunities)
- What tools/systems they currently use for the relevant work
- What they've already tried to fix this, and why it did or didn't stick

Ask sharp, concrete questions, not abstract ones — vivid framings get better answers than generic ones:
- Instead of "what are your pain points," try "if you could wave a magic wand and fix one thing in the business, what would it be?" or "what does a bad day look like for you?"
- When they name a cost (hours/week, a dollar figure, an error rate), it's worth pushing one level deeper once rather than taking the first number at face value — e.g. "what would the team do with that time back?" That second answer is often the more useful one.
- When they mention something they've tried before, ask what happened, not just that it happened — "worked" and "didn't stick" are different findings.

Once you know roughly which part of the business the pain lives in, let it sharpen your next question instead of staying generic:
- Sales/marketing: lead flow and what touches a lead before a human does, CRM hygiene (trusted vs. shadow spreadsheets), what happens to a lead that doesn't convert on the first touch
- Operations: where work sits waiting on a person (manual data entry, approvals, queues) instead of moving on its own, what breaks or gets escalated most often
- Customer support: how much ticket volume is genuinely novel vs. the same few questions on repeat, response time expectations vs. reality
- Finance/back-office: how much manual matching happens between systems, how stale reports are by the time someone reads them
- Founder/leadership: where they feel like they personally are the bottleneck (founders rarely volunteer this unprompted), where a competitor is already using AI in a way that worries them
Blend these rather than forcing one — plenty of businesses don't map cleanly onto a single category.

Rules that matter:
- One question at a time. Never stack multiple questions in one message.
- If they ask something off-topic (e.g. "does Kaidon Labs do X?"), answer it briefly and honestly if you know it, then continue the conversation naturally — don't ignore it to force your own next question.
- Never invent a fact about Kaidon Labs' capabilities, availability, or track record.
- Never state a specific price, cost range, or package name. If asked "how much would this cost," be honest: that's exactly what the full audit is for, and pricing depends on specifics you can't know yet from a short chat — Brian will go over that directly.
- Never guarantee an outcome or timeline.
- Never directly ask "who's the decision maker," "what's your budget," or "what's your timeline" — this is a free, no-pressure tool, and interrogating them like a sales-qualification call would break that promise. If any of that comes up naturally on its own (e.g. "I'd need to run this by my partner," "we're hoping to have something in place by fall," "we've paid for consultants before"), record it via update_findings — it's useful signal, just never fished for.
- After every message the prospect sends, call the update_findings tool to record what you learned (merge with what's already known — you'll be shown the current state). It's fine to call it with no meaningful change if nothing new came up.
- CRITICAL: whenever you call update_findings, ALWAYS also include your next chat reply as text in that exact same response — never call the tool alone and wait for another turn to reply. The prospect is waiting live; a tool call with no accompanying reply reads as the conversation freezing.
- Once you have a real sense of the business, at least one concrete pain point, and either a tools/systems signal or a size/volume signal, set ready_for_synthesis to true in that same tool call and wrap the conversation up warmly (something like: thank them, tell them you're putting together a couple of thoughts on where AI could help). Don't drag the conversation out once you have enough to work with — 4-6 exchanges is usually plenty.
- Keep every message short — a few sentences, chat-length, not an essay.`;

export const FINDINGS_TOOL = {
  name: "update_findings",
  description: "Record or update what you've learned about the prospect's business so far. Always pass the full current state (merge new info with what you already knew) — this overwrites the stored record, it doesn't append.",
  input_schema: {
    type: "object",
    properties: {
      business_summary: { type: "string", description: "What the business does, in a sentence or two." },
      size_or_volume_signal: { type: "string", description: "Team size, order/customer volume, or similar scale signal, if known." },
      pain_points: {
        type: "array",
        items: { type: "string" },
        description: "Specific pain points mentioned, each as a short phrase.",
      },
      pain_point_cost: { type: "string", description: "Cost/impact of the pain points if given — hours/week, $ impact, error rate, etc." },
      tools_systems_in_use: {
        type: "array",
        items: { type: "string" },
        description: "Tools/systems currently used for the relevant workflow.",
      },
      what_theyve_tried: { type: "string", description: "What they've already tried to fix this, and why it did or didn't work, if mentioned." },
      primary_department_or_function: { type: "string", description: "Which part of the business the core pain point centers on, if clear — e.g. Sales/Marketing, Operations, Customer Support, Finance, IT, Founder-level. Leave blank if it doesn't fit one cleanly." },
      decision_maker_signal: { type: "string", description: "Only fill this in if it came up naturally (never ask directly) — any mention of who else would be involved in deciding on something like this." },
      timeline_signal: { type: "string", description: "Only fill this in if it came up naturally (never ask directly) — any sense of urgency or timeframe for solving this." },
      budget_precedent_signal: { type: "string", description: "Only fill this in if it came up naturally (never ask directly) — any mention of having paid for outside help/tools for something like this before." },
      ready_for_synthesis: {
        type: "boolean",
        description: "True once there's enough signal to synthesize recommended initiatives: a business summary, at least one real pain point, and either a tools/systems or size/volume signal.",
      },
    },
    required: ["ready_for_synthesis"],
  },
};

// Builds the full messages array Claude sees, given the lead's intake info
// and the transcript stored so far. The opener context is synthetic — it's
// never written into the stored `conversation`, only prepended here so the
// model has a reason to greet the prospect by name/company on the very
// first call.
export function buildMessages(lead, conversation) {
  const openerContext = {
    role: "user",
    content: `[SYSTEM CONTEXT — not shown to the prospect: A new prospect just submitted the intake form. Name: ${lead.name}. Company: ${lead.company || "not given"}. Greet them warmly and personally, referencing their company if given, and ask one easy opening question to start understanding their business.]`,
  };
  const history = conversation.map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: turn.message,
  }));
  return [openerContext, ...history];
}

// Runs the tool-use loop for one turn: calls the model, executes any
// update_findings calls locally (merging into `extracted`), feeds the tool
// result back, and repeats until the model responds with plain text (or
// the iteration cap is hit). Returns { replyText, extracted, readyForSynthesis }.
export async function runConversationTurn({ client, messages, extracted }) {
  let currentMessages = [...messages];
  let mergedExtracted = { ...extracted };
  let readyForSynthesis = false;

  for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [FINDINGS_TOOL],
      messages: currentMessages,
    });

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text");
    const replyText = textBlocks.map((b) => b.text).join("\n").trim();

    if (toolUseBlocks.length === 0) {
      return { replyText, extracted: mergedExtracted, readyForSynthesis };
    }

    // Execute each tool_use block locally (this "tool" is just a local merge —
    // no external side effect happens here beyond updating our in-memory record).
    const toolResults = toolUseBlocks.map((block) => {
      if (block.name === "update_findings") {
        mergedExtracted = { ...mergedExtracted, ...block.input };
        if (block.input.ready_for_synthesis) readyForSynthesis = true;
      }
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: "recorded",
      };
    });

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];

    // If the model already gave a text reply alongside the tool call, that's
    // our answer — no need to force another round trip just to get text.
    if (replyText) {
      return { replyText, extracted: mergedExtracted, readyForSynthesis };
    }
  }

  // Loop exhausted without the model ever giving us text (shouldn't happen
  // given the system prompt, but a silent empty reply would look exactly
  // like the chat freezing on the frontend — better to say something).
  return {
    replyText: "Thanks for sharing that — give me just a moment to gather my thoughts.",
    extracted: mergedExtracted,
    readyForSynthesis,
  };
}

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert AI consultant synthesizing the results of a short, self-serve intake chat into recommended initiatives. You'll be given structured findings extracted from the conversation.

Kaidon Labs' four core service areas are: 1) RAG Agents (AI assistants grounded in a business's own documents/data), 2) Lead Gen Automations (AI-driven outreach, qualification, and follow-up), 3) Voice Agents (AI phone/voice assistants for calls, scheduling, and support), 4) Content Automations (AI-assisted content creation and publishing). When an initiative genuinely fits one of these areas, name and frame it that way — it signals real, deliverable expertise rather than generic AI hype. Don't force-fit a category that doesn't match the findings; a good initiative outside these four is still fine to recommend.

Produce two versions:

1. "prospect" — 2 to 3 initiatives to show the prospect directly, right now, with zero human review. Each needs a short name and a one-sentence "why this" grounded specifically in what they said (not generic AI hype). ABSOLUTELY NO dollar figures, cost ranges, or package/tier names anywhere in this version — that's a hard rule, not a style preference. If you don't have enough signal for 2 solid initiatives, it's fine to return just 1 — never pad with something generic just to hit a count.

2. "internal" — the same initiatives, but with more detail for Brian's eyes only: a fuller "why this" including the specific evidence from the conversation, and a rough sense of feasibility/impact. Also include "fee_estimate_note": a short internal note suggesting a ballpark for the audit engagement fee itself (not the eventual build cost) using this business's own discovery/audit pricing band of $1,500–$4,000, credited toward the project fee if the client moves forward — reason briefly about where in that band this prospect likely falls based on what came up (e.g. number of pain points, apparent complexity), but keep it clearly labeled as your own suggestion, not a quote already given to anyone.

Also include "qualification_signal": a short internal note (for Brian's eyes only, never shown to the prospect) summarizing how promising this lead looks as a real buyer — not a hard pass/fail verdict, just honest triage signal. Base it on whatever surfaced naturally in the chat: decision_maker_signal, timeline_signal, and budget_precedent_signal in the findings. If none of the three came up (which will be common — the chat never asks for them directly), say so plainly, e.g. "No decision-maker/timeline/budget signal surfaced — this was a short exploratory chat, treat as unqualified until a real conversation happens." Don't invent signal that isn't there.

Respond with ONLY valid JSON, no markdown code fences, matching exactly this shape:
{"prospect": [{"name": "...", "why": "..."}], "internal": [{"name": "...", "why": "...", "evidence": "..."}], "fee_estimate_note": "...", "qualification_signal": "..."}`;

// One extra model call, no tools, given the accumulated findings — returns
// { prospect: [...], internal: [...], fee_estimate_note: "..." }.
export async function synthesizeInitiatives({ client, extracted }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048, // was 1024 — that truncated mid-JSON in practice once evidence/notes got verbose
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Findings from the conversation:\n\n${JSON.stringify(extracted, null, 2)}`,
      },
    ],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  // Models don't always obey "no markdown fences" — strip them, and fall back
  // to the first {...} block if there's stray prose around the JSON.
  let cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const truncated = response.stop_reason === "max_tokens" ? " (response hit max_tokens and was cut off mid-JSON)" : "";
    throw new Error(`Synthesis response wasn't valid JSON${truncated}: ${err.message}\nRaw: ${text}`);
  }
}
