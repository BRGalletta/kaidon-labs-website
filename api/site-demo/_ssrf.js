// SSRF protection for /api/site-demo/*. This is the first feature in this
// repo that fetches an arbitrary, publicly-submitted URL from our own
// server (audit-chat and the rest of the site never do) — every code path
// that touches a visitor-submitted URL must go through here first.
//
// Two entry points:
//   - assertSafeUrl(rawUrl): full validation (scheme/length/denylist/DNS +
//     private-IP check), used once up front in create.js before anything
//     else happens.
//   - fetchWithSsrfProtection(url, options): a fetch() wrapper used by
//     _scrape.js for every request it makes. Re-validates the URL, fetches
//     with redirect:"manual", and if (and only if) the response is a single
//     redirect, re-validates and follows exactly one hop — handling the
//     extremely common http->https / apex->www normalization case without
//     opening up unbounded redirect-chasing.
//
// The screenshot provider (ScreenshotOne) does its own fetch of the target
// URL from its own infrastructure, not ours — that's outside this file's
// threat model. This file only protects requests *we* make server-side.

import dns from "node:dns";
import net from "node:net";

export const USER_AGENT = "KaidonLabsSiteDemoBot/1.0 (+https://kaidonlabs.tech/site-demo/)";

const MAX_URL_LENGTH = 2048;
const STRING_DENYLIST_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const PROBE_TIMEOUT_MS = 8000;

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function isIPv4InCidr(ip, cidr) {
  const [base, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

const IPV4_PRIVATE_CIDRS = [
  "127.0.0.0/8", // loopback
  "10.0.0.0/8", // private
  "172.16.0.0/12", // private
  "192.168.0.0/16", // private
  "169.254.0.0/16", // link-local — includes the 169.254.169.254 cloud metadata endpoint
  "0.0.0.0/8", // "this network"
];

function isPrivateIPv4(ip) {
  return IPV4_PRIVATE_CIDRS.some((cidr) => isIPv4InCidr(ip, cidr));
}

// Expands an IPv6 address (including "::" shorthand and IPv4-mapped
// addresses like "::ffff:192.168.1.1") into a 128-bit BigInt, plus the
// embedded IPv4 address if present — a mapped address embedding a private
// IPv4 is a real SSRF bypass technique, so that embedded address gets
// checked against the IPv4 denylist too.
function expandIPv6(ip) {
  let addr = ip;
  let embeddedIPv4 = null;

  const v4MappedMatch = addr.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4MappedMatch) {
    embeddedIPv4 = v4MappedMatch[2];
    const ipInt = ipv4ToInt(embeddedIPv4);
    if (ipInt === null) return null;
    const hi = ((ipInt >>> 16) & 0xffff).toString(16);
    const lo = (ipInt & 0xffff).toString(16);
    addr = `${v4MappedMatch[1]}${hi}:${lo}`;
  }

  let head = [];
  let tail = [];
  if (addr.includes("::")) {
    const [h, t] = addr.split("::");
    head = h ? h.split(":") : [];
    tail = t ? t.split(":") : [];
  } else {
    head = addr.split(":");
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.length !== 8) return null;

  let big = 0n;
  for (const g of groups) {
    const val = parseInt(g || "0", 16);
    if (Number.isNaN(val) || val < 0 || val > 0xffff) return null;
    big = (big << 16n) | BigInt(val);
  }
  return { big, embeddedIPv4 };
}

function isIPv6InCidr(ip, cidr) {
  const [base, prefixStr] = cidr.split("/");
  const prefix = BigInt(Number(prefixStr));
  const ipExpanded = expandIPv6(ip);
  const baseExpanded = expandIPv6(base);
  if (!ipExpanded || !baseExpanded) return false;
  const fullMask = (1n << 128n) - 1n;
  const mask = prefix === 0n ? 0n : (fullMask << (128n - prefix)) & fullMask;
  return (ipExpanded.big & mask) === (baseExpanded.big & mask);
}

const IPV6_PRIVATE_CIDRS = [
  "::1/128", // loopback
  "::/128", // unspecified
  "fc00::/7", // unique local
  "fe80::/10", // link-local
];

function isPrivateIPv6(ip) {
  const expanded = expandIPv6(ip);
  if (expanded?.embeddedIPv4 && isPrivateIPv4(expanded.embeddedIPv4)) return true;
  return IPV6_PRIVATE_CIDRS.some((cidr) => isIPv6InCidr(ip, cidr));
}

function isPrivateIp(address, family) {
  return family === 4 || family === "IPv4" ? isPrivateIPv4(address) : isPrivateIPv6(address);
}

class SsrfValidationError extends Error {}

// Parses/checks a URL's scheme, length, and hostname denylist, resolves DNS,
// and rejects if any resolved address is private/reserved. Does NOT make any
// HTTP request — this is a cheap, fast check safe to run in create.js before
// any external call fires. Returns the normalized URL string on success,
// throws SsrfValidationError (with a visitor-friendly .message) on failure.
export async function assertSafeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw new SsrfValidationError("Please enter a valid website URL.");
  }

  // The frontend already normalizes a schemeless input like "example.com"
  // to "https://example.com" before this is ever called, but the API
  // shouldn't rely on that alone — normalize here too, defense-in-depth.
  // Only prepend when there's no scheme at all (not just a non-http one) —
  // "ftp://x" or "javascript:x" should fall through to the protocol check
  // below and get a clear "only http/https" rejection, not get mangled by
  // having "https://" glued onto the front of an already-schemed string.
  let candidate = rawUrl.trim();
  if (candidate && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new SsrfValidationError("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfValidationError("Only http:// and https:// URLs are supported.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (STRING_DENYLIST_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new SsrfValidationError("That URL isn't a public website we can preview.");
  }

  // Hostname given as a literal IP — check it directly, no DNS needed.
  const literalFamily = net.isIP(hostname);
  if (literalFamily && isPrivateIp(hostname, literalFamily)) {
    throw new SsrfValidationError("That URL isn't a public website we can preview.");
  }

  if (!literalFamily) {
    let addresses;
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch {
      throw new SsrfValidationError("We couldn't resolve that domain — double check the URL.");
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address, a.family))) {
      throw new SsrfValidationError("That URL isn't a public website we can preview.");
    }
  }

  return parsed.toString();
}

// fetch() wrapper for the actual scrape requests: re-validates the URL,
// fetches with redirect:"manual", and follows up to 2 redirect hops
// (each re-validated) before giving up — chosen from real-world testing:
// a bare http:// entry commonly chains through *two* separate redirects
// (http->https, then apex->www), not just one, so allowing only a single
// hop rejected sites that should legitimately work. Still bounded, not
// unbounded chasing.
export async function fetchWithSsrfProtection(rawUrl, { timeoutMs = PROBE_TIMEOUT_MS, hopsRemaining = 2 } = {}) {
  const safeUrl = await assertSafeUrl(rawUrl);

  const res = await fetch(safeUrl, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": USER_AGENT },
  });

  const isRedirect = res.status >= 300 && res.status < 400 && res.headers.get("location");
  if (isRedirect) {
    if (hopsRemaining <= 0) {
      throw new SsrfValidationError("That site redirected more than once — we couldn't safely preview it.");
    }
    const nextUrl = new URL(res.headers.get("location"), safeUrl).toString();
    return fetchWithSsrfProtection(nextUrl, { timeoutMs, hopsRemaining: hopsRemaining - 1 });
  }

  return res;
}

export { SsrfValidationError };
