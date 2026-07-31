# Kaidon Labs Website

Marketing site + Markdown-driven blog engine for Kaidon Labs, an AI solutions agency. Plain HTML/CSS/JS for the marketing pages — no framework, no bundler. The blog is authored in Markdown and compiled to static HTML by a small Node build script.

## Project structure

```
index.html              Marketing site homepage
css/styles.css          All site styles (shared by marketing pages and blog)
js/script.js            Nav toggle, footer year, contact form handling

ai-audit/index.html     Self-serve AI audit chat page (lead-gate form -> chat -> result)
css/audit-chat.css      Styles for the ai-audit page only
js/audit-chat.js        Lead-gate + chat + result view logic for ai-audit
api/audit-chat/         Vercel serverless functions backing ai-audit (see "AI Audit chat" below)

site-demo/index.html            Self-serve "chat with your own site" demo landing page
site-demo/preview/index.html    Screenshot backdrop + floating chat widget (see "Site Demo" below)
css/site-demo.css                Styles for both site-demo pages
js/site-demo.js                  Landing-page form logic
js/site-demo-preview.js          Preview-page polling + floating widget + chat logic
api/site-demo/                   Vercel serverless functions backing site-demo

api/_lib/                Generic helpers (Anthropic client, Supabase fetch/storage) shared by both features
api/schema.sql          One-time SQL for the website_audit_leads and site_demo_sessions Supabase tables

blog/posts/              Published post source files (Markdown + frontmatter)
blog/drafts/              Pending post source files awaiting auto-publish
blog/index.html          Generated: chronological post listing (do not hand-edit)
blog/<slug>/index.html   Generated: one HTML page per post (do not hand-edit)

content/topics.json      Rotating pool of 25 evergreen blog topics + content guardrails

scripts/build.js                 Renders blog/posts/*.md -> blog/index.html + blog/<slug>/index.html
scripts/new-draft.js             CLI: saves a new draft to blog/drafts/ with a 24h publishAt
scripts/publish-due-drafts.js    Promotes due drafts from blog/drafts/ to blog/posts/
scripts/template.js              Shared HTML shell (nav/footer) used by build.js
```

## Running the site locally

No build step is required to view the marketing pages or already-generated blog pages — they're static HTML. From the project root, serve the folder with any static file server, for example:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed local URL (e.g. `http://localhost:3000` or `http://localhost:8000`) in a browser.

## Installing dependencies and building the blog

The blog engine has two dependencies: `marked` (Markdown -> HTML) and `gray-matter` (frontmatter parsing).

```bash
npm install
npm run build
```

`npm run build` runs `node scripts/build.js`, which reads every `.md` file in `blog/posts/`, renders it into the shared site template, and writes:

- `blog/<slug>/index.html` for each individual post
- `blog/index.html`, a newest-first listing of all published posts

Run this any time you add, edit, or remove a post in `blog/posts/`. The generated `blog/index.html` and `blog/<slug>/index.html` files are build output — edit the Markdown source instead of the generated HTML.

## Writing a new blog post manually

1. Add a new Markdown file to `blog/posts/`, e.g. `blog/posts/my-new-post.md`.
2. Include frontmatter at the top of the file:

   ```markdown
   ---
   title: "Your Post Title"
   date: "2026-08-01"
   slug: "your-post-title"
   excerpt: "One or two sentences describing the post for the blog listing."
   ---

   Your Markdown content starts here.
   ```

3. Follow the content guardrails in `content/topics.json` (`_guidelines` field): general AI-adoption/business-education content in Kaidon Labs' voice, no fabricated client stories or case studies, no invented statistics presented as fact, and end every post with a soft CTA back to booking a meeting or the contact section.
4. Run `npm run build` to generate the HTML.
5. Commit the new Markdown file *and* the generated HTML under `blog/`.

## How the daily automation is intended to work

This repo includes the building blocks for an automated draft -> publish pipeline; the actual scheduling (cron, GitHub Actions schedule, etc.) is intentionally **not** wired up here — that's a separate step outside this repo.

The intended flow:

1. **Draft creation** — a daily automation picks an unused topic from `content/topics.json`, has an AI write a post in Kaidon Labs' voice following the `_guidelines` in that file, and pipes the result into:

   ```bash
   node scripts/new-draft.js --title "Post Title" --slug "post-title" --excerpt "Teaser text" < body.md
   ```

   This writes `blog/drafts/post-title.md` with `status: pending` and `publishAt` set to 24 hours from creation time. The automation should also mark the topic as used in `content/topics.json` (`used` array) so the pool cycles without repeats.

2. **Publishing due drafts** — on a later run (e.g. the next day's automation, or a separate scheduled job), run:

   ```bash
   node scripts/publish-due-drafts.js
   ```

   This scans `blog/drafts/*.md`, and for any draft whose `publishAt` timestamp has passed, moves it into `blog/posts/` (stripping the `status`/`publishAt` fields, keeping `title`/`date`/`slug`/`excerpt`) and deletes it from `blog/drafts/`. Drafts not yet due are left untouched. It's safe to run this repeatedly — with zero due drafts it's a no-op.

3. **Rebuilding HTML** — after publishing, run:

   ```bash
   node scripts/build.js
   ```

   to regenerate `blog/index.html` and the newly published post's `blog/<slug>/index.html`.

4. **Deploy** — commit the changes (new/updated Markdown + generated HTML) and push to `main`. See "Hosting" below.

The net effect: a draft written today publishes automatically ~24 hours later, without a human needing to manually move files, as long as `publish-due-drafts.js` and `build.js` are run on a schedule (e.g. a daily cron job or GitHub Actions workflow calling both scripts, then committing and pushing the result).

## Placeholders to replace before launch

- ~~**Formspree form ID**~~ — done. `index.html` contact form now posts to `https://formspree.io/f/mjgnadvg`.
- ~~**Contact email**~~ — done. `brian@kaidonlabs.tech` is the confirmed inbox, used in `index.html` (footer + contact section), `ai-audit/index.html`, and every generated blog page footer (via `scripts/template.js`).
- **Social links** — the footer social icons (LinkedIn, X, GitHub) in `index.html` and `scripts/template.js` currently point to `href="#"`. Replace with real profile URLs before launch. Marked with an HTML comment above the icons.

## AI Audit chat (`/ai-audit`)

A self-serve chat a prospect can run directly on the site: a lead-gate form (name/email/company), then a few minutes of adaptive conversation with an AI intake assistant, ending in 2-3 concrete AI-opportunity areas shown on-screen immediately — no dollar figures or package pricing, by design (see `api/audit-chat/_shared.js`'s system/synthesis prompts for why). You get a fuller internal email via Resend the moment each chat completes, including a suggested audit-fee ballpark for your eyes only.

**This feature needs a real backend and will not work on GitHub Pages** — GitHub Pages only serves static files, and this needs the serverless functions under `api/audit-chat/`. It works at kaidonlabs.tech because that domain is pointed at Vercel (see "Hosting" above). Don't link `/ai-audit` from the GitHub Pages mirror — only the kaidonlabs.tech URL can run the chat.

### One-time setup before this works live

1. **Supabase**: this uses its own dedicated Supabase project — separate from the one hosting the agency's `pipeline` table, so anonymous website leads never mix with vetted client data. Run `api/schema.sql` once in that project's SQL editor (Project → SQL Editor → New query).
2. **Resend**: sign up at resend.com if you don't already have an account, and generate an API key. `_notify.js` sends from `notifications@kaidonlabs.tech` by default, which requires the `kaidonlabs.tech` domain to be verified in Resend (Domains → Add Domain → add the DNS records it gives you) — Resend's shared `onboarding@resend.dev` sandbox sender only ever delivers to your own Resend account email, regardless of what else is verified, so a real verified domain is required for this to reach anyone else.
3. **Vercel environment variables** (Project Settings → Environment Variables): `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from the *dedicated AI-audit-leads* Supabase project's Project Settings → API — not the `agency-secrets.env` values, those are the agency pipeline's separate project), `RESEND_API_KEY`, and optionally `NOTIFY_EMAIL` (defaults to `brian@kaidonlabs.tech`) and `NOTIFY_FROM_ADDRESS` (defaults to `Kaidon Labs AI Audit <notifications@kaidonlabs.tech>` — override if `notifications@` isn't an address you want this sending from).
4. Redeploy after setting the env vars so the serverless functions pick them up.

### Local testing

`npm install` picks up the new `@anthropic-ai/sdk` and `resend` dependencies. To test the API handlers locally you'll need the Vercel CLI (`npm i -g vercel`, then `vercel dev`) and a local `.env` with the same variables listed above — the handlers are plain `(req, res)` functions and don't depend on any Vercel-specific APIs beyond that.

## Site Demo (`/site-demo`)

A self-serve "chat with your own site" demo: a visitor enters any public URL, and the tool captures a full-page screenshot of that site's homepage, reads its public content (homepage + up to 3 obviously-linked pages like About/Services/Contact, no deep crawl), and shows the screenshot with a live AI chat widget floating on top — grounded entirely in that site's own content — as a demo of what a custom Kaidon Labs RAG chatbot would feel like installed on a real site. Same lead-gate pattern as `/ai-audit` (name/email/company, plus the target URL).

Flow: `POST /api/site-demo/create` (fast — validates the lead and SSRF-checks the URL, creates a `pending` session, returns immediately) → the preview page at `/site-demo/preview/?session_id=...` triggers `POST /api/site-demo/capture` (the slow step — screenshot + scrape run concurrently, then one Claude call generates the opening message) → the preview page polls `GET /api/site-demo/status` until ready → `POST /api/site-demo/chat` handles each turn afterward. See `api/site-demo/_ssrf.js` for the SSRF protections around fetching an arbitrary public URL server-side (this is the only feature in the repo that does), and `api/site-demo/_shared.js` for why this chatbot has no tool-use loop or synthesis step, unlike audit-chat.

**Also needs the Vercel backend, same as `/ai-audit`** — won't work on the GitHub Pages mirror.

### One-time setup before this works live

1. **Supabase schema**: append is already in `api/schema.sql` (the `site_demo_sessions` table) — re-run the whole file in the same dedicated AI-audit-leads Supabase project (same trust tier as `website_audit_leads`: anonymous public-visitor data, no vetting).
2. **Supabase Storage bucket**: create a bucket named `site-demo-screenshots` in that same project (Storage → New bucket) and mark it **public**. Screenshots are fetched server-side from the screenshot provider and re-uploaded here — the provider's own URL is never stored or served directly, since it embeds a paid API key as a query parameter that would otherwise leak to every visitor's browser.
3. **ScreenshotOne**: sign up at screenshotone.com (a screenshot-as-a-service API — deliberately used instead of running headless Chromium inside a Vercel function, which has known binary-size/timeout problems) and grab an API key.
4. **Vercel environment variable**: `SCREENSHOTONE_API_KEY`, alongside the existing `ANTHROPIC_API_KEY`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` already set up for audit-chat (reused as-is — same Supabase project).
5. Redeploy after setting the env var.

### Retention

Sessions (screenshots + scraped content) are meant to expire after **14 days** — there's no cron infrastructure in this repo (same as the daily blog automation, which is also meant to be run externally), so run `node scripts/cleanup-site-demo-sessions.js` manually or wire it into whatever scheduler eventually runs the daily content automation.

## Hosting

**Primary: Vercel**, with the custom domain **kaidonlabs.tech** (and `www.kaidonlabs.tech`) pointed at it — nameservers are `ns1.vercel-dns.com`, so DNS is managed in the Vercel dashboard (Project → Settings → Domains). This is what serves the site to real visitors, including `/api/audit-chat/*` and `/api/site-demo/*`. `vercel.json` pins `outputDirectory` to the repo root and `framework` to `null` since this isn't a recognized framework — without it, Vercel's zero-config detection assumes a `public/` folder that doesn't exist here and the deploy fails with "No Output Directory named public found." `buildCommand` re-runs `npm run build` on every deploy, which is harmless (idempotent) even though the output is already committed.

The repo is also still on **GitHub Pages, serving from the `main` branch** (https://brgalletta.github.io/kaidon-labs-website/) as an unused static mirror/backup — it can't run `/api/audit-chat/*` or `/api/site-demo/*`, so neither chat feature works through anything but kaidonlabs.tech. All internal links (nav, CTAs, blog template) use relative paths, so nothing in the HTML hardcodes either host.

The generated blog HTML (`blog/index.html`, `blog/<slug>/index.html`) is committed to the repository rather than built by CI — there is no GitHub Actions build step. Run `npm run build` locally (or as part of the daily automation described above) and commit the output before pushing.

## SEO

Every page has a canonical URL, Open Graph/Twitter meta tags, and JSON-LD structured data pointed at `https://kaidonlabs.tech` — this also doubles as the fix for the GitHub Pages mirror being duplicate content, since canonical tags tell crawlers to consolidate on the Vercel domain regardless of which host actually got crawled.

- **Homepage** (`index.html`): `Organization` (with the four core services as `makesOffer`) + `WebSite` schema. `sameAs` is intentionally omitted — the footer social links are still placeholders (`href="#"`); add real profile URLs there and to the schema together once they exist.
- **`/ai-audit`**: `FAQPage` schema mirroring the on-page FAQ verbatim (Google requires the schema text to match visible text), plus a `BreadcrumbList`.
- **`/site-demo`**: canonical/OG/Twitter + `BreadcrumbList`, same as any other static marketing page. Its dynamic sibling, `/site-demo/preview/*`, is deliberately excluded from all of this (`noindex, nofollow` meta tag + a `robots.txt` disallow) — those pages render a third party's scraped content and screenshot, and should never be indexed or treated as this site's own content.
- **Blog posts / blog index** (`scripts/template.js`, `scripts/build.js`): `renderPage()` takes `canonicalPath` and `schema` and handles canonical/OG/Twitter/JSON-LD automatically. Each post gets `BlogPosting` + `BreadcrumbList` schema generated from its frontmatter — nothing to hand-maintain per post.
- **`sitemap.xml`** (repo root) is regenerated by `npm run build` on every run — it covers the homepage, `/ai-audit`, `/site-demo`, the blog index, and every published post (never `/site-demo/preview/*`), so it self-updates as part of the existing daily content automation. `robots.txt` (repo root) allows everything except `/api/` and `/site-demo/preview/`, and points crawlers at the sitemap.

To sanity-check structured data after changes, paste a page's URL into [Google's Rich Results Test](https://search.google.com/test/rich-results).
