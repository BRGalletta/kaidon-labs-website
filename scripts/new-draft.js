#!/usr/bin/env node
// scripts/new-draft.js
//
// CLI for saving a freshly AI-written draft post. Intended to be invoked
// by a daily automation: the automation writes a title/slug/excerpt plus
// the Markdown body (piped via stdin), and this script saves it to
// blog/drafts/<slug>.md with status: pending and a publishAt timestamp
// 24 hours in the future. scripts/publish-due-drafts.js later promotes it
// to blog/posts/ once that timestamp has passed.
//
// Usage:
//   node scripts/new-draft.js --title "Post Title" --slug "post-title" --excerpt "One-sentence teaser." < body.md
//
// Or pipe the body from another process:
//   echo "## Body markdown here" | node scripts/new-draft.js --title "..." --slug "..." --excerpt "..."

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRAFTS_DIR = path.join(ROOT, "blog", "drafts");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
      args[key] = value;
      i++;
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      // No piped input — return empty body rather than hanging.
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeYamlString(value) {
  return String(value).replace(/"/g, '\\"');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const title = args.title;
  const slug = args.slug ? slugify(args.slug) : title ? slugify(title) : "";
  const excerpt = args.excerpt || "";

  if (!title || !slug) {
    console.error(
      "Usage: node scripts/new-draft.js --title \"Post Title\" --slug \"post-slug\" --excerpt \"Teaser text\" < body.md"
    );
    process.exit(1);
  }

  const body = (await readStdin()).trim();

  const now = new Date();
  const publishAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const createdDate = now.toISOString();

  const frontmatter = [
    "---",
    `title: "${escapeYamlString(title)}"`,
    `date: "${createdDate}"`,
    `slug: "${slug}"`,
    `excerpt: "${escapeYamlString(excerpt)}"`,
    `status: pending`,
    `publishAt: "${publishAt}"`,
    "---",
    ""
  ].join("\n");

  const fileContent = `${frontmatter}\n${body}\n`;

  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const outPath = path.join(DRAFTS_DIR, `${slug}.md`);

  if (fs.existsSync(outPath)) {
    console.error(`A draft already exists at blog/drafts/${slug}.md — choose a different slug.`);
    process.exit(1);
  }

  fs.writeFileSync(outPath, fileContent, "utf8");
  console.log(`Draft saved: blog/drafts/${slug}.md (publishAt: ${publishAt})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
