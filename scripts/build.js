#!/usr/bin/env node
// scripts/build.js
//
// Reads every published post in blog/posts/*.md, parses frontmatter with
// gray-matter, renders the Markdown body with marked, and writes:
//   - blog/<slug>/index.html   (one per post, using the shared site template)
//   - blog/index.html          (chronological, newest-first listing)
//
// Run with: node scripts/build.js  (or `npm run build`)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { renderPage } from "./template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const BLOG_DIR = path.join(ROOT, "blog");

function formatDate(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.warn(`No posts directory found at ${POSTS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));

  const posts = files.map((filename) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf8");
    const { data, content } = matter(raw);

    if (!data.title || !data.slug || !data.date) {
      throw new Error(
        `Post "${filename}" is missing required frontmatter (title, slug, date).`
      );
    }

    return {
      title: data.title,
      date: data.date,
      slug: data.slug,
      excerpt: data.excerpt || "",
      html: marked.parse(content),
      filename
    };
  });

  // Newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
}

function writePostPage(post) {
  const outDir = path.join(BLOG_DIR, post.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const bodyHtml = `    <article class="post-article">
      <a class="back-link" href="../">&larr; Back to Blog</a>
      <p class="post-meta">${formatDate(post.date)}</p>
      <h1>${post.title}</h1>
      <div class="post-body">
${post.html}
      </div>

      <div class="post-cta">
        <h3>Curious how this applies to your business?</h3>
        <p>Book a free 30-minute call with Kaidon Labs and we'll talk through what makes sense for your team.</p>
        <a class="btn btn-primary" href="https://calendly.com/brian-kaidonlabs/30min" target="_blank" rel="noopener">Book a Meeting</a>
      </div>
    </article>`;

  const html = renderPage({
    depth: 2,
    title: `${post.title} | Kaidon Labs Blog`,
    description: post.excerpt || post.title,
    bodyHtml
  });

  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  console.log(`Wrote blog/${post.slug}/index.html`);
}

function writeBlogIndex(posts) {
  const cards = posts
    .map(
      (post) => `        <article class="blog-card">
          <p class="post-date">${formatDate(post.date)}</p>
          <h3>${post.title}</h3>
          <p>${post.excerpt}</p>
          <a class="read-more" href="${post.slug}/">Read the post &rarr;</a>
        </article>`
    )
    .join("\n");

  const emptyState = `        <p>No posts published yet — check back soon.</p>`;

  const bodyHtml = `    <section class="blog-hero">
      <div class="container">
        <h1>The Kaidon Labs Blog</h1>
        <p>Practical, jargon-free guidance on AI adoption, chatbots, integration, and strategy for growing businesses.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="blog-index-grid">
${posts.length ? cards : emptyState}
        </div>
      </div>
    </section>`;

  const html = renderPage({
    depth: 1,
    title: "Blog | Kaidon Labs",
    description:
      "Practical AI insights for growing businesses — chatbots, integration, consulting, and strategy from Kaidon Labs.",
    bodyHtml
  });

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), html, "utf8");
  console.log(`Wrote blog/index.html (${posts.length} post${posts.length === 1 ? "" : "s"})`);
}

function build() {
  const posts = readPosts();
  posts.forEach(writePostPage);
  writeBlogIndex(posts);
  console.log("Build complete.");
}

build();
