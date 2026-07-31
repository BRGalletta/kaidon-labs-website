// GET /api/site-demo/status?session_id=...
// Cheap Supabase-only read (no external calls) the preview page polls to
// find out when a session's screenshot+scrape capture has finished. Once
// ready, returns everything the preview page needs to render in one
// response — screenshot URL, target URL (for the disclaimer badge), and the
// opening chat message — so no second round trip is needed just to show it.

import { supabaseFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId = req.query?.session_id;
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

    if (session.status === "ready") {
      const opener = (session.conversation || []).find((t) => t.role === "assistant");
      res.status(200).json({
        status: "ready",
        target_url: session.target_url,
        screenshot_url: session.screenshot_url,
        message: opener?.message || "Hi! Ask me anything about this business.",
      });
      return;
    }

    if (session.status === "failed") {
      res.status(200).json({
        status: "failed",
        target_url: session.target_url,
        error_message: session.error_message || "Something went wrong capturing this site.",
      });
      return;
    }

    res.status(200).json({ status: "pending", target_url: session.target_url });
  } catch (err) {
    console.error(`site-demo/status: ${err.message}`);
    res.status(500).json({ error: "Something went wrong checking your demo's status." });
  }
}
