// Shared Anthropic client setup, used by every /api/*/ feature that talks to
// Claude (currently audit-chat and site-demo). Extracted out of a single
// feature's _shared.js so a second feature never has to reach sideways into
// a sibling's file to get a generic helper.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5";

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
