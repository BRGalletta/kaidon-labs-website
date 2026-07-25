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
api/schema.sql          One-time SQL for the website_audit_leads Supabase table

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
- **Contact email** — `brian@kaidonlabs.com` appears in `index.html` (footer + contact section) and in every generated blog page footer (via `scripts/template.js`). Marked with HTML comments; confirm this is the correct inbox before launch.
- **Social links** — the footer social icons (LinkedIn, X, GitHub) in `index.html` and `scripts/template.js` currently point to `href="#"`. Replace with real profile URLs before launch. Marked with an HTML comment above the icons.

## AI Audit chat (`/ai-audit`)

A self-serve chat a prospect can run directly on the site: a lead-gate form (name/email/company), then a few minutes of adaptive conversation with an AI intake assistant, ending in 2-3 concrete AI-opportunity areas shown on-screen immediately — no dollar figures or package pricing, by design (see `api/audit-chat/_shared.js`'s system/synthesis prompts for why). You get a fuller internal email via Resend the moment each chat completes, including a suggested audit-fee ballpark for your eyes only.

**This feature needs a real backend and will not work on GitHub Pages** — GitHub Pages only serves static files, and this needs the serverless functions under `api/audit-chat/`. It only works when the site is accessed through Vercel (already connected to this repo) or a custom domain pointed at Vercel. Decide before sharing the `/ai-audit` link with anyone: cut the whole site over to Vercel as primary, or just link this page from the Vercel URL while GitHub Pages keeps serving everything else as it does today. Nothing about the code differs either way.

### One-time setup before this works live

1. **Supabase**: this uses its own dedicated Supabase project — separate from the one hosting the agency's `pipeline` table, so anonymous website leads never mix with vetted client data. Run `api/schema.sql` once in that project's SQL editor (Project → SQL Editor → New query).
2. **Resend**: sign up at resend.com if you don't already have an account, and generate an API key. `_notify.js` sends from `notifications@kaidonlabs.com` by default, which requires the `kaidonlabs.com` domain to be verified in Resend (Domains → Add Domain → add the DNS records it gives you) — Resend's shared `onboarding@resend.dev` sandbox sender only ever delivers to your own Resend account email, regardless of what else is verified, so a real verified domain is required for this to reach anyone else.
3. **Vercel environment variables** (Project Settings → Environment Variables): `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from the *dedicated AI-audit-leads* Supabase project's Project Settings → API — not the `agency-secrets.env` values, those are the agency pipeline's separate project), `RESEND_API_KEY`, and optionally `NOTIFY_EMAIL` (defaults to `brian@kaidonlabs.com`) and `NOTIFY_FROM_ADDRESS` (defaults to `Kaidon Labs AI Audit <notifications@kaidonlabs.com>` — override if `notifications@` isn't an address you want this sending from).
4. Redeploy after setting the env vars so the serverless functions pick them up.

### Local testing

`npm install` picks up the new `@anthropic-ai/sdk` and `resend` dependencies. To test the API handlers locally you'll need the Vercel CLI (`npm i -g vercel`, then `vercel dev`) and a local `.env` with the same variables listed above — the handlers are plain `(req, res)` functions and don't depend on any Vercel-specific APIs beyond that.

## Hosting

This site is hosted on **GitHub Pages, serving from the `main` branch** (https://brgalletta.github.io/kaidon-labs-website/). The generated blog HTML (`blog/index.html`, `blog/<slug>/index.html`) is committed to the repository rather than built by CI — there is no GitHub Actions build step. Run `npm run build` locally (or as part of the daily automation described above) and commit the output before pushing.

It's also connected to **Vercel** for redundancy / an eventual custom domain. `vercel.json` pins `outputDirectory` to the repo root and `framework` to `null` since this isn't a recognized framework — without it, Vercel's zero-config detection assumes a `public/` folder that doesn't exist here and the deploy fails with "No Output Directory named public found." `buildCommand` re-runs `npm run build` on every deploy, which is harmless (idempotent) even though the output is already committed.
