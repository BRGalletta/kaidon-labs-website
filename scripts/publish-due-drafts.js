#!/usr/bin/env node
// scripts/publish-due-drafts.js
//
// Scans blog/drafts/*.md for posts whose `publishAt` timestamp has passed.
// For each due draft, rewrites it into blog/posts/<slug>.md keeping only
// title/date/slug/excerpt (status and publishAt are stripped), and removes
// the original file from blog/drafts/. Drafts not yet due are left
// untouched. Safe to run repeatedly — with zero due drafts it's a no-op.
//
// Run with: node scripts/publish-due-drafts.js
// After running, call `node scripts/build.js` to regenerate the HTML.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRAFTS_DIR = path.join(ROOT, "blog", "drafts");
const POSTS_DIR = path.join(ROOT, "blog", "posts");

function main() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log("No drafts directory found — nothing to publish.");
    return;
  }

  const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.log("No drafts pending — nothing to publish.");
    return;
  }

  fs.mkdirSync(POSTS_DIR, { recursive: true });

  const now = new Date();
  let publishedCount = 0;

  for (const filename of files) {
    const draftPath = path.join(DRAFTS_DIR, filename);
    const raw = fs.readFileSync(draftPath, "utf8");
    const { data, content } = matter(raw);

    if (!data.publishAt) {
      console.warn(`Skipping ${filename}: missing publishAt field.`);
      continue;
    }

    const publishAt = new Date(data.publishAt);
    if (isNaN(publishAt.getTime())) {
      console.warn(`Skipping ${filename}: invalid publishAt value "${data.publishAt}".`);
      continue;
    }

    if (publishAt > now) {
      // Not due yet — leave untouched.
      continue;
    }

    const { title, date, slug, excerpt } = data;

    if (!title || !slug) {
      console.warn(`Skipping ${filename}: missing required title/slug frontmatter.`);
      continue;
    }

    const publishedFrontmatter = {
      title,
      date: date || publishAt.toISOString(),
      slug,
      excerpt: excerpt || ""
    };

    const publishedContent = matter.stringify(content, publishedFrontmatter);
    const destPath = path.join(POSTS_DIR, `${slug}.md`);

    if (fs.existsSync(destPath)) {
      console.warn(
        `A published post already exists at blog/posts/${slug}.md — skipping ${filename} to avoid overwriting.`
      );
      continue;
    }

    fs.writeFileSync(destPath, publishedContent, "utf8");
    fs.unlinkSync(draftPath);
    publishedCount++;
    console.log(`Published: blog/drafts/${filename} -> blog/posts/${slug}.md`);
  }

  if (publishedCount === 0) {
    console.log("No drafts were due for publishing.");
  } else {
    console.log(`${publishedCount} draft(s) published. Run "node scripts/build.js" to regenerate HTML.`);
  }
}

main();
