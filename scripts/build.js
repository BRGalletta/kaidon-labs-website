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
import { renderPage, SITE_URL } from "./template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const BLOG_DIR = path.join(ROOT, "blog");

// Static (hand-authored) pages included in the sitemap alongside the
// generated blog pages. lastmod is read from the file's mtime so it stays
// roughly accurate without needing to hand-maintain a date.
const STATIC_PAGES = [
  { urlPath: "/", file: path.join(ROOT, "index.html") },
  { urlPath: "/ai-audit/", file: path.join(ROOT, "ai-audit", "index.html") },
  { urlPath: "/site-demo/", file: path.join(ROOT, "site-demo", "index.html") },
];

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

  const canonicalPath = `/blog/${post.slug}/`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const isoDate = new Date(post.date).toISOString();

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt || post.title,
      datePublished: isoDate,
      dateModified: isoDate,
      url: canonicalUrl,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
      author: { "@type": "Organization", name: "Kaidon Labs", url: SITE_URL },
      publisher: { "@type": "Organization", name: "Kaidon Labs", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Kaidon Labs", item: SITE_URL + "/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog/` },
        { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
      ],
    },
  ];

  const html = renderPage({
    depth: 2,
    title: `${post.title} | Kaidon Labs Blog`,
    description: post.excerpt || post.title,
    bodyHtml,
    canonicalPath,
    schema
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

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Kaidon Labs", item: SITE_URL + "/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog/` },
    ],
  };

  const html = renderPage({
    depth: 1,
    title: "Blog | Kaidon Labs",
    description:
      "Practical AI insights for growing businesses — chatbots, integration, consulting, and strategy from Kaidon Labs.",
    bodyHtml,
    canonicalPath: "/blog/",
    schema
  });

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), html, "utf8");
  console.log(`Wrote blog/index.html (${posts.length} post${posts.length === 1 ? "" : "s"})`);
}

function writeSitemap(posts) {
  const toDateStamp = (d) => new Date(d).toISOString().slice(0, 10);

  const staticEntries = STATIC_PAGES.map(({ urlPath, file }) => {
    const lastmod = fs.existsSync(file) ? toDateStamp(fs.statSync(file).mtime) : undefined;
    return { urlPath, lastmod };
  });

  const blogIndexEntry = {
    urlPath: "/blog/",
    lastmod: posts.length ? toDateStamp(posts[0].date) : undefined, // posts are sorted newest-first
  };

  const postEntries = posts.map((post) => ({
    urlPath: `/blog/${post.slug}/`,
    lastmod: toDateStamp(post.date),
  }));

  const allEntries = [...staticEntries, blogIndexEntry, ...postEntries];

  const urlXml = allEntries
    .map(
      ({ urlPath, lastmod }) => `  <url>
    <loc>${SITE_URL}${urlPath}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlXml}
</urlset>
`;

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
  console.log(`Wrote sitemap.xml (${allEntries.length} URLs)`);
}

function build() {
  const posts = readPosts();
  posts.forEach(writePostPage);
  writeBlogIndex(posts);
  writeSitemap(posts);
  console.log("Build complete.");
}

build();
