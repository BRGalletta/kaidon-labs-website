// POST /api/site-demo/create
// Body: { name, email, company, target_url }
// Fast endpoint: validates the lead, SSRF-checks the URL (DNS-only, no live
// fetch of the target — see _ssrf.js), enforces daily per-email and per-IP
// caps, and creates a `pending` session row. Returns { session_id }
// immediately, with no external network calls in this request at all. The
// actual screenshot+scrape work happens in a separate request
// (POST .../capture) fired by the preview page itself, so this endpoint
// stays fast enough to safely sit behind the landing page's form submit.

import { supabaseFetch } from "../_lib/supabase.js";
import { assertSafeUrl, SsrfValidationError } from "./_ssrf.js";

const DAILY_CAP_PER_EMAIL = 3;
// Email is self-reported and trivially spoofable per-submission, but this
// feature has real per-use provider cost (a screenshot API call), unlike
// audit-chat which only ever costs a Claude call — so IP gets its own
// dimension. Raised from an initial 5 to give room for testing during
// launch; worth dialing back down once real traffic starts.
const DAILY_CAP_PER_IP = 20;

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { name, email, company, target_url: targetUrlInput, viewport } = req.body || {};
  if (!name || !email || !targetUrlInput) {
    res.status(400).json({ error: "name, email, and target_url are required" });
    return;
  }
  // Untrusted client-reported hint of the visitor's own device at submit
  // time (see js/site-demo.js) — anything other than the one recognized
  // value just falls back to desktop, no validation error needed for it.
  const safeViewport = viewport === "mobile" ? "mobile" : "desktop";

  let safeUrl;
  try {
    safeUrl = await assertSafeUrl(targetUrlInput);
  } catch (err) {
    const message =
      err instanceof SsrfValidationError ? err.message : "That URL couldn't be validated — please double check it.";
    res.status(400).json({ error: message });
    return;
  }

  const clientIp = getClientIp(req);

  try {
    const todayIso = new Date().toISOString().slice(0, 10);

    const [existingByEmail, existingByIp] = await Promise.all([
      supabaseFetch(`site_demo_sessions?email=eq.${encodeURIComponent(email)}&created_at=gte.${todayIso}&select=id`),
      supabaseFetch(
        `site_demo_sessions?created_ip=eq.${encodeURIComponent(clientIp)}&created_at=gte.${todayIso}&select=id`
      ),
    ]);

    if (existingByEmail.length >= DAILY_CAP_PER_EMAIL) {
      res
        .status(429)
        .json({ error: "You've already run a few of these today — please book a call directly instead." });
      return;
    }
    if (existingByIp.length >= DAILY_CAP_PER_IP) {
      res.status(429).json({
        error: "This demo has hit its usage limit for today from your network — please try again tomorrow, or book a call directly.",
      });
      return;
    }

    const [session] = await supabaseFetch("site_demo_sessions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [
        {
          name,
          email,
          company: company || null,
          target_url: safeUrl,
          created_ip: clientIp,
          viewport: safeViewport,
          status: "pending",
        },
      ],
    });

    res.status(200).json({ session_id: session.id });
  } catch (err) {
    console.error(`site-demo/create: ${err.message}`);
    res.status(500).json({ error: "Something went wrong starting your demo. Please try again in a moment." });
  }
}
