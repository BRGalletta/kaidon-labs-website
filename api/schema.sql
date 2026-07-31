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

-- Stores every self-serve "chat with your own site" demo run from
-- /site-demo — same trust tier as website_audit_leads (anonymous public
-- visitor data, no vetting), so it lives in the same dedicated project
-- rather than a new one. A session moves 'pending' -> 'ready' (screenshot +
-- scraped content captured, chat is live) or 'failed' (screenshot/scrape
-- error, error_message explains why to the visitor).
create table site_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  target_url text not null,
  created_ip text,                                -- for the per-IP daily abuse cap (email alone is self-reported)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending',          -- 'pending' | 'ready' | 'failed'
  screenshot_url text,                              -- full-page screenshot from the screenshot provider
  scraped_content text,                             -- capped/cleaned text grounding the chat's system prompt
  scraped_pages jsonb default '[]'::jsonb,          -- [{url, title}] of homepage + key pages actually fetched
  content_thin boolean not null default false,       -- true if scraped content came back under the thin-content threshold
  robots_disallowed boolean not null default false,  -- true if the target's robots.txt disallowed crawling
  accent_color text,                                -- "#rrggbb" from the target's <meta name="theme-color">, when usable; null -> widget uses Kaidon Labs' default colors
  error_message text,                               -- populated on status='failed', shown to the visitor
  conversation jsonb not null default '[]'::jsonb   -- [{role, message, timestamp}]
);

create index site_demo_sessions_email_created_idx on site_demo_sessions (email, created_at);
create index site_demo_sessions_ip_created_idx on site_demo_sessions (created_ip, created_at);

alter table site_demo_sessions enable row level security;
