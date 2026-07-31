// POST /api/site-demo/capture
// Body: { session_id }
// The slow step: fires the screenshot capture and the content scrape
// concurrently, uploads the screenshot bytes to Supabase Storage (never the
// provider's own URL — see _screenshot.js for why), generates the opening
// chat message grounded in whatever content was scraped, and marks the
// session 'ready' (or 'failed' if the screenshot itself didn't come back —
// without a screenshot the whole demo doesn't make sense, but a weak/failed
// scrape alone doesn't fail the session, it just produces a more limited
// chatbot per _shared.js's thin-content guardrail).
//
// Triggered by the preview page itself right after landing, not by create.js
// — see the approved plan for why this is split into its own request.

import { randomUUID } from "node:crypto";
import { supabaseFetch, supabaseStorageUpload } from "../_lib/supabase.js";
import { captureScreenshot, ScreenshotError } from "./_screenshot.js";
import { scrapeSite } from "./_scrape.js";
import { buildSystemPrompt, buildOpenerMessages, runChatTurn } from "./_shared.js";

const SCREENSHOT_BUCKET = "site-demo-screenshots";

// Higher than audit-chat's 30s: this request has a real third-party network
// dependency (the screenshot render) stacked with a multi-page scrape,
// running concurrently with each other but each with their own timeout
// budget (20s / ~21s worst case), plus one Claude call after both resolve.
// If your plan's max is lower than this, Vercel will say so at deploy time —
// lower the number to match rather than removing it. Load-test against a
// few real, not-fast sites before considering this launch-ready.
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { session_id: sessionId } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  try {
    const [session] = await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}&select=*`);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Idempotent: a retried/duplicate request just hands back the current
    // state instead of re-running the capture (avoids double-billing the
    // screenshot provider if the frontend fires this twice).
    if (session.status !== "pending") {
      res.status(200).json({
        status: session.status,
        screenshot_url: session.screenshot_url,
        error_message: session.error_message,
      });
      return;
    }

    const [screenshotResult, scrapeResult] = await Promise.allSettled([
      captureScreenshot(session.target_url),
      scrapeSite(session.target_url),
    ]);

    if (screenshotResult.status === "rejected") {
      const message =
        screenshotResult.reason instanceof ScreenshotError
          ? screenshotResult.reason.message
          : "Something went wrong capturing your site's screenshot.";
      await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}`, {
        method: "PATCH",
        body: { status: "failed", error_message: message, updated_at: new Date().toISOString() },
      });
      res.status(200).json({ status: "failed", error_message: message });
      return;
    }

    const { bytes, contentType } = screenshotResult.value;
    const extension = contentType.includes("png") ? "png" : "jpg";
    const screenshotUrl = await supabaseStorageUpload(
      SCREENSHOT_BUCKET,
      `${sessionId}/${randomUUID()}.${extension}`,
      bytes,
      contentType
    );

    // A rejected scrapeResult shouldn't happen in practice (scrapeSite is
    // designed to degrade to a thin/empty result rather than throw), but
    // treat it the same way regardless — the screenshot alone is enough to
    // mark the session ready with a maximally-limited chatbot.
    const scrape =
      scrapeResult.status === "fulfilled"
        ? scrapeResult.value
        : { combinedText: "", pages: [], thin: true, robotsDisallowed: false, accentColor: null };

    const systemPrompt = buildSystemPrompt({
      targetUrl: session.target_url,
      scrapedContent: scrape.combinedText,
      thin: scrape.thin,
      robotsDisallowed: scrape.robotsDisallowed,
    });

    const openerMessage = await runChatTurn({ systemPrompt, messages: buildOpenerMessages() });
    const conversation = [{ role: "assistant", message: openerMessage, timestamp: new Date().toISOString() }];

    await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}`, {
      method: "PATCH",
      body: {
        status: "ready",
        screenshot_url: screenshotUrl,
        scraped_content: scrape.combinedText,
        scraped_pages: scrape.pages,
        content_thin: scrape.thin,
        robots_disallowed: scrape.robotsDisallowed,
        accent_color: scrape.accentColor,
        conversation,
        updated_at: new Date().toISOString(),
      },
    });

    res.status(200).json({ status: "ready", screenshot_url: screenshotUrl, message: openerMessage });
  } catch (err) {
    console.error(`site-demo/capture: ${err.message}`);
    // Best-effort: try to mark the session failed so the preview page's
    // polling doesn't spin forever, but don't let a second failure here mask
    // the original error in the response.
    await supabaseFetch(`site_demo_sessions?id=eq.${sessionId}`, {
      method: "PATCH",
      body: { status: "failed", error_message: "Something went wrong capturing your site.", updated_at: new Date().toISOString() },
    }).catch(() => {});
    res.status(500).json({ error: "Something went wrong capturing your site. Please try again in a moment." });
  }
}
