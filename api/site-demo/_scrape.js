// Homepage + shallow "key page" text extraction for /api/site-demo/capture.
// No deep crawl by design: homepage plus up to a few obviously-linked pages
// (About/Services/Contact/etc.), one level deep, fetched concurrently.
//
// Uses linkedom (not cheerio) for read-only HTML parsing — smaller
// dependency footprint than cheerio's jQuery-style API, which matters given
// Vercel serverless bundle size and the fact that this repo only ever pulls
// in a dependency when it's actually load-bearing (4 deps before this one).
//
// Accepted limitation: a plain fetch() only sees server-rendered HTML, so
// JS-heavy client-rendered sites (many modern React/Vue marketing sites)
// will scrape thin or empty. The "thin" flag this returns lets the caller
// tell the chatbot's system prompt to be upfront about that rather than
// hallucinating confidently about a site it barely saw.

import { parseHTML } from "linkedom";
import { fetchWithSsrfProtection } from "./_ssrf.js";

const MAX_TOTAL_CHARS = 9000;
const KEY_PAGE_KEYWORDS = ["about", "services", "solutions", "product", "contact", "pricing", "team"];
const MAX_KEY_PAGES = 3;
const THIN_CONTENT_THRESHOLD = 500;
const PAGE_FETCH_TIMEOUT_MS = 8000;
const ROBOTS_FETCH_TIMEOUT_MS = 5000;

function extractTextFromHtml(html) {
  const { document } = parseHTML(html);
  for (const el of [...document.querySelectorAll("script, style, nav, footer, noscript, svg, iframe")]) {
    el.remove();
  }
  const title = document.querySelector("title")?.textContent?.trim() || "";
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "";
  const bodyText = (document.body?.textContent || "").replace(/\s+/g, " ").trim();
  return { title, metaDescription, text: bodyText };
}

// Same-origin links, one path segment deep, whose href or link text matches
// a key-page keyword — e.g. "/about", "/services", "Contact Us".
function findKeyPageLinks(html, baseUrl) {
  const { document } = parseHTML(html);
  const base = new URL(baseUrl);
  const seen = new Set();
  const found = [];

  for (const link of [...document.querySelectorAll("a[href]")]) {
    if (found.length >= MAX_KEY_PAGES) break;
    const href = link.getAttribute("href");
    if (!href) continue;

    let resolved;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;

    // Same-page anchors (e.g. "/#services" on a one-page site) resolve to
    // the same path as the homepage — not a distinct page, skip it rather
    // than wasting a fetch slot re-fetching identical HTML.
    if (resolved.pathname === base.pathname) continue;

    const segments = resolved.pathname.split("/").filter(Boolean);
    if (segments.length > 1) continue; // one level deep only

    const hrefLower = href.toLowerCase();
    const linkText = (link.textContent || "").toLowerCase();
    const isKeyPage = KEY_PAGE_KEYWORDS.some((kw) => hrefLower.includes(kw) || linkText.includes(kw));
    if (!isKeyPage) continue;

    const normalized = resolved.toString();
    if (seen.has(normalized) || normalized === baseUrl) continue;
    seen.add(normalized);
    found.push(normalized);
  }
  return found;
}

// Minimal robots.txt check — just enough to answer "is '/' disallowed for
// '*'", not a general-purpose parser (deliberately narrow scope per plan).
function isHomepageDisallowed(robotsText) {
  const lines = robotsText.split(/\r?\n/);
  let inWildcardGroup = false;
  const disallowedPrefixes = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      inWildcardGroup = value === "*";
    } else if (key === "disallow" && inWildcardGroup && value) {
      disallowedPrefixes.push(value);
    }
  }
  return disallowedPrefixes.some((prefix) => "/".startsWith(prefix) || prefix === "/");
}

async function checkRobotsAllowsHomepage(targetUrl) {
  try {
    const robotsUrl = new URL("/robots.txt", targetUrl).toString();
    const res = await fetchWithSsrfProtection(robotsUrl, { timeoutMs: ROBOTS_FETCH_TIMEOUT_MS });
    if (!res.ok) return true; // no robots.txt (404 etc.) -> allowed
    const text = await res.text();
    return !isHomepageDisallowed(text);
  } catch {
    // Network hiccup on robots.txt itself shouldn't block scraping — fail open,
    // matching the plan's "screenshot proceeds regardless" spirit.
    return true;
  }
}

// Returns { combinedText, pages: [{url, title}], thin, robotsDisallowed }.
// Never throws for a normal degraded case (unreachable homepage, thin
// content, robots-disallowed) — those all resolve to a valid-but-limited
// result so capture.js can still mark the session "ready" with a screenshot
// even when scraping came back weak. Only a truly unexpected error escapes.
export async function scrapeSite(targetUrl) {
  const robotsAllowed = await checkRobotsAllowsHomepage(targetUrl);

  let homepageHtml;
  try {
    const res = await fetchWithSsrfProtection(targetUrl, { timeoutMs: PAGE_FETCH_TIMEOUT_MS });
    homepageHtml = await res.text();
  } catch {
    return { combinedText: "", pages: [], thin: true, robotsDisallowed: !robotsAllowed };
  }

  const { title, metaDescription, text } = extractTextFromHtml(homepageHtml);
  const pages = [{ url: targetUrl, title }];

  if (!robotsAllowed) {
    // Only head metadata, never body text, when the site's robots.txt asks
    // us not to crawl it — the screenshot still happens regardless (a
    // one-off visual capture is a different act than retaining body text).
    const combinedText = [title, metaDescription].filter(Boolean).join(" — ").slice(0, MAX_TOTAL_CHARS);
    return { combinedText, pages, thin: true, robotsDisallowed: true };
  }

  let combinedText = text;
  const keyPageUrls = findKeyPageLinks(homepageHtml, targetUrl);
  const keyPageResults = await Promise.allSettled(
    keyPageUrls.map(async (url) => {
      const res = await fetchWithSsrfProtection(url, { timeoutMs: PAGE_FETCH_TIMEOUT_MS });
      const html = await res.text();
      const parsed = extractTextFromHtml(html);
      return { url, title: parsed.title, text: parsed.text };
    })
  );

  for (const result of keyPageResults) {
    if (result.status === "fulfilled") {
      combinedText += `\n\n${result.value.text}`;
      pages.push({ url: result.value.url, title: result.value.title });
    }
    // A failed key-page fetch is silently skipped — it's a bonus page, not
    // the homepage, so one failing shouldn't degrade the whole session.
  }

  combinedText = combinedText.trim().slice(0, MAX_TOTAL_CHARS);
  const thin = combinedText.length < THIN_CONTENT_THRESHOLD;

  return { combinedText, pages, thin, robotsDisallowed: false };
}
