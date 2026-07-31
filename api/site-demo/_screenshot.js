// Thin wrapper around the ScreenshotOne API (screenshotone.com) — a
// third-party screenshot-as-a-service, deliberately used instead of running
// headless Chromium ourselves inside a Vercel serverless function (binary
// size limits, cold starts, and timeout risk make that a poor fit here).
// ScreenshotOne does its own fetch of the target URL from its own
// infrastructure — that request is outside this repo's SSRF threat model
// (see _ssrf.js's file comment); the URL passed in here has already been
// through assertSafeUrl() in create.js.
//
// IMPORTANT: this fetches the image BYTES server-side and returns them —
// it deliberately does not hand back the ScreenshotOne request URL for the
// frontend to load directly, because that URL embeds our paid API key as a
// query parameter (access_key=...). Serving that URL to a visitor's browser
// would leak the key to anyone who opens dev tools or views page source.
// capture.js uploads the returned bytes to Supabase Storage and only ever
// persists/serves that key-free public URL.

const SCREENSHOTONE_API_KEY = process.env.SCREENSHOTONE_API_KEY;
const SCREENSHOT_TIMEOUT_MS = 20000;

// A real, current iPhone Safari UA — some sites branch their layout on user
// agent rather than (or in addition to) viewport width, so viewport_mobile
// alone isn't always enough to get the actual mobile experience.
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export class ScreenshotError extends Error {}

// `mobile: true` captures as an iPhone would see it (the visitor's own
// device at the time they submitted the form — see create.js/capture.js)
// instead of ScreenshotOne's desktop default, so the demo shows the layout
// that visitor would actually get on the real site.
function buildScreenshotRequestUrl(targetUrl, { mobile = false } = {}) {
  if (!SCREENSHOTONE_API_KEY) {
    throw new ScreenshotError("SCREENSHOTONE_API_KEY is not set");
  }
  const params = new URLSearchParams({
    access_key: SCREENSHOTONE_API_KEY,
    url: targetUrl,
    full_page: "true",
    format: "jpg",
    image_quality: "80",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    cache: "true", // ScreenshotOne-side caching — repeat demos of the same site don't re-render
    // Without this, ScreenshotOne hard-fails the whole request whenever the
    // target's homepage responds with a non-2xx status — which real sites do
    // surprisingly often (bot-protection challenge pages, geo/consent
    // redirects, a site that 404s at "/" but is otherwise fine). We'd still
    // rather show whatever page actually came back than fail the demo
    // outright; a bot-block page in the screenshot is an honest reflection
    // of what happened, not a broken feature.
    ignore_host_errors: "true",
    // Without this, ScreenshotOne doesn't include the
    // X-ScreenshotOne-HTTP-Response-Status-Code response header at all, so
    // there'd be no way to tell "rendered the real homepage" apart from
    // "rendered a bot-block/error page" once ignore_host_errors lets both
    // come back as a 200.
    metadata_http_response_status_code: "true",
  });

  if (mobile) {
    params.set("viewport_width", "390");
    params.set("viewport_height", "844");
    params.set("device_scale_factor", "2");
    params.set("viewport_mobile", "true");
    params.set("viewport_has_touch", "true");
    params.set("user_agent", MOBILE_USER_AGENT);
  }

  return `https://api.screenshotone.com/take?${params.toString()}`;
}

// Returns { bytes: ArrayBuffer, contentType: string } — never a URL
// containing the API key. Throws ScreenshotError on failure/timeout.
export async function captureScreenshot(targetUrl, options) {
  const requestUrl = buildScreenshotRequestUrl(targetUrl, options);

  let res;
  try {
    res = await fetch(requestUrl, { signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS) });
  } catch (err) {
    throw new ScreenshotError(`Screenshot request failed or timed out: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ScreenshotError(`Screenshot provider returned ${res.status}: ${text.slice(0, 300)}`);
  }

  // ignore_host_errors above means ScreenshotOne still returns 200 + image
  // bytes even when the target itself errored (bot-protection challenge
  // page, geo block, etc.) — this header carries the *target's* real status
  // code so we can catch that case and fail the session cleanly instead of
  // silently uploading a screenshot of someone else's "Access Denied" page
  // and presenting it as this business's homepage.
  const originStatus = Number(res.headers.get("x-screenshotone-http-response-status-code"));
  if (originStatus && (originStatus < 200 || originStatus >= 300)) {
    throw new ScreenshotError(
      `This site blocked our screenshot tool (it returned HTTP ${originStatus}) — try a different URL.`
    );
  }

  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { bytes, contentType };
}
