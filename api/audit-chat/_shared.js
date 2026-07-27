// Shared helpers for the /api/audit-chat/* serverless functions: the
// Anthropic client setup, a thin Supabase REST wrapper (same apikey/Bearer
// pattern the agency skills already use against the `pipeline` table, just
// pointed at `website_audit_leads`), the conversation system prompt, and
// the tool schema used for inline structured-data extraction.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5";
export const MAX_USER_TURNS = 8; // hard backstop even if the model never sets ready_for_synthesis
// Kept small on purpose: each iteration is a sequential live Claude call within
// one Vercel function invocation, and Vercel's per-request timeout (as low as
// 10s on some plans) is easy to blow through with 3+ round trips as the
// conversation's context grows. The system prompt now tells the model to always
// reply in the same turn as any tool call, so this should rarely exceed 1.
export const MAX_TOOL_LOOP_ITERATIONS = 2;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Test-only seam: the SDK doesn't reliably pick up a reassigned
// globalThis.fetch, so a test harness that needs to mock Anthropic calls
// should call setTestFetchOverride() before invoking a handler. Production
// code never calls this, so testFetchOverride stays undefined in prod.
let testFetchOverride;
export function setTestFetchOverride(fn) {
  testFetchOverride = fn;
}

export function getAnthropicClient() {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY, ...(testFetchOverride ? { fetch: testFetchOverride } : {}) });
}

// Minimal fetch wrapper against Supabase's PostgREST API. Throws on any
// non-OK response so callers can decide how to handle it — this module
// never swallows an error silently.
export async function supabaseFetch(path, { method = "GET", body, headers = {} } = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

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

Rules that matter:
- One question at a time. Never stack multiple questions in one message.
- If they ask something off-topic (e.g. "does Kaidon Labs do X?"), answer it briefly and honestly if you know it, then continue the conversation naturally — don't ignore it to force your own next question.
- Never invent a fact about Kaidon Labs' capabilities, availability, or track record.
- Never state a specific price, cost range, or package name. If asked "how much would this cost," be honest: that's exactly what the full audit is for, and pricing depends on specifics you can't know yet from a short chat — Brian will go over that directly.
- Never guarantee an outcome or timeline.
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

Respond with ONLY valid JSON, no markdown code fences, matching exactly this shape:
{"prospect": [{"name": "...", "why": "..."}], "internal": [{"name": "...", "why": "...", "evidence": "..."}], "fee_estimate_note": "..."}`;

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
