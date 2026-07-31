// Minimal fetch wrapper against Supabase's PostgREST API, shared by every
// /api/*/ feature that stores data in the "website public-visitor data"
// Supabase project (currently audit-chat and site-demo — a separate project
// from the agency's vetted-client pipeline data). Throws on any non-OK
// response so callers can decide how to handle it — this module never
// swallows an error silently.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Uploads bytes to a Supabase Storage bucket and returns the bucket's public
// URL for that object. The bucket must already exist and be set to public
// read access (Storage → create bucket → "Public bucket" — a one-time setup
// step, same spirit as running schema.sql once). Uses "x-upsert" so a retry
// with the same path overwrites cleanly instead of erroring on conflict.
export async function supabaseStorageUpload(bucket, objectPath, bytes, contentType) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase Storage upload to ${bucket}/${objectPath} failed (${res.status}): ${text}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}
