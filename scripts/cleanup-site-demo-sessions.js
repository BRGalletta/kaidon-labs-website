#!/usr/bin/env node
// scripts/cleanup-site-demo-sessions.js
//
// Deletes site_demo_sessions rows older than the retention window (14
// days) — screenshots and scraped third-party content shouldn't be kept
// indefinitely. There's no cron infrastructure in this repo (same as the
// daily blog automation), so this is meant to be run manually or wired
// into whatever scheduler eventually runs that automation, not invoked
// automatically by anything here.
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment
// (the same dedicated project used by both audit-chat and site-demo).
//
// Run with: node scripts/cleanup-site-demo-sessions.js

import { supabaseFetch } from "../api/_lib/supabase.js";

const RETENTION_DAYS = 14;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const toDelete = await supabaseFetch(`site_demo_sessions?created_at=lt.${cutoff}&select=id`);
  if (toDelete.length === 0) {
    console.log(`No site_demo_sessions rows older than ${RETENTION_DAYS} days — nothing to clean up.`);
    return;
  }

  await supabaseFetch(`site_demo_sessions?created_at=lt.${cutoff}`, { method: "DELETE" });
  console.log(`Deleted ${toDelete.length} site_demo_sessions row(s) older than ${RETENTION_DAYS} days.`);
}

main().catch((err) => {
  console.error(`cleanup-site-demo-sessions: ${err.message}`);
  process.exitCode = 1;
});
