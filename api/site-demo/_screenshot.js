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

export class ScreenshotError extends Error {}

function buildScreenshotRequestUrl(targetUrl) {
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
  });
  return `https://api.screenshotone.com/take?${params.toString()}`;
}

// Returns { bytes: ArrayBuffer, contentType: string } — never a URL
// containing the API key. Throws ScreenshotError on failure/timeout.
export async function captureScreenshot(targetUrl) {
  const requestUrl = buildScreenshotRequestUrl(targetUrl);

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

  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { bytes, contentType };
}
