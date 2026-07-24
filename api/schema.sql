-- Run this once in the SQL editor of the Supabase project dedicated to the
-- website's AI Audit leads (Project → SQL Editor → New query) — a separate
-- project from the one hosting the agency's `pipeline` table, kept apart on
-- purpose so anonymous website chat leads never land in the same database
-- as vetted client/pipeline data. Stores every self-serve AI-audit chat run
-- from the website's /ai-audit page: the raw conversation, the structured findings extracted
-- from it, and both versions of the synthesized recommended initiatives
-- (the no-pricing teaser shown to the prospect on-screen, and the fuller
-- internal version — including a suggested audit-fee ballpark — that only
-- goes out in the email to Brian).

create extension if not exists "pgcrypto";

create table website_audit_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  created_at timestamptz not null default now(),
  status text not null default 'in_progress', -- 'in_progress' | 'completed'
  conversation jsonb not null default '[]'::jsonb,       -- [{role, message, timestamp}]
  extracted jsonb not null default '{}'::jsonb,           -- structured findings, built up via the update_findings tool
  initiatives_prospect jsonb,                              -- 2-3 teaser initiatives shown on-screen (no pricing)
  initiatives_internal jsonb,                              -- fuller initiatives + internal audit-fee ballpark, for Brian's email only
  updated_at timestamptz not null default now()
);

create index website_audit_leads_email_created_idx on website_audit_leads (email, created_at);

-- Locks the table down against the public anon key, same as `pipeline`.
-- The service_role key (used by api/audit-chat/*.js) bypasses RLS by
-- design, so this doesn't affect the app at all — it just means the table
-- stays private if the anon key or project URL is ever exposed.
alter table website_audit_leads enable row level security;
