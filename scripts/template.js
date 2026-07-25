// scripts/template.js
// Shared HTML shell for blog pages (listing + individual posts).
// Reuses the same nav/footer structure and css/styles.css as the
// marketing site's index.html so the blog stays visually consistent.
//
// `depth` = how many directories deep the output file lives relative to
// the project root, so relative asset/link paths resolve correctly:
//   0 = project root (not used here, index.html is hand-authored)
//   1 = blog/index.html
//   2 = blog/<slug>/index.html

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2314335c'/%3E%3Ccircle cx='20' cy='22' r='6' fill='%2316b8a6'/%3E%3Ccircle cx='44' cy='20' r='5' fill='%23ffffff'/%3E%3Ccircle cx='46' cy='44' r='6' fill='%2316b8a6'/%3E%3Ccircle cx='20' cy='42' r='4' fill='%23ffffff'/%3E%3Cline x1='20' y1='22' x2='44' y2='20' stroke='%23ffffff' stroke-width='2'/%3E%3Cline x1='20' y1='22' x2='20' y2='42' stroke='%23ffffff' stroke-width='2'/%3E%3Cline x1='20' y1='42' x2='46' y2='44' stroke='%2316b8a6' stroke-width='2'/%3E%3Cline x1='44' y1='20' x2='46' y2='44' stroke='%23ffffff' stroke-width='2'/%3E%3C/svg%3E";

function rootPrefix(depth) {
  return "../".repeat(depth);
}

function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#14335c"/>
    <circle cx="20" cy="22" r="6" fill="#16b8a6"/>
    <circle cx="44" cy="20" r="5" fill="#ffffff"/>
    <circle cx="46" cy="44" r="6" fill="#16b8a6"/>
    <circle cx="20" cy="42" r="4" fill="#ffffff"/>
    <line x1="20" y1="22" x2="44" y2="20" stroke="#ffffff" stroke-width="2"/>
    <line x1="20" y1="22" x2="20" y2="42" stroke="#ffffff" stroke-width="2"/>
    <line x1="20" y1="42" x2="46" y2="44" stroke="#16b8a6" stroke-width="2"/>
    <line x1="44" y1="20" x2="46" y2="44" stroke="#ffffff" stroke-width="2"/>
  </svg>`;
}

function footerBrandMark() {
  return `<svg class="brand-mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#16b8a6"/>
    <circle cx="20" cy="22" r="6" fill="#0f172a"/>
    <circle cx="44" cy="20" r="5" fill="#ffffff"/>
    <circle cx="46" cy="44" r="6" fill="#0f172a"/>
    <circle cx="20" cy="42" r="4" fill="#ffffff"/>
    <line x1="20" y1="22" x2="44" y2="20" stroke="#ffffff" stroke-width="2"/>
    <line x1="20" y1="22" x2="20" y2="42" stroke="#ffffff" stroke-width="2"/>
    <line x1="20" y1="42" x2="46" y2="44" stroke="#0f172a" stroke-width="2"/>
    <line x1="44" y1="20" x2="46" y2="44" stroke="#ffffff" stroke-width="2"/>
  </svg>`;
}

function header(depth) {
  const root = rootPrefix(depth);
  return `<header>
    <nav class="navbar" aria-label="Primary">
      <div class="container">
        <a href="${root}index.html#top" class="brand" aria-label="Kaidon Labs home">
          ${brandMark()}
          Kaidon Labs
        </a>

        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="nav-links">
          <span></span><span></span><span></span>
        </button>

        <ul class="nav-links" id="nav-links">
          <li><a href="${root}index.html#services">Services</a></li>
          <li><a href="${root}index.html#expertise">What We Do</a></li>
          <li><a href="${root}blog/">Blog</a></li>
          <li><a href="${root}index.html#contact">Contact</a></li>
          <li class="nav-cta">
            <a class="btn btn-primary btn-sm" href="https://calendly.com/brian-kaidonlabs/30min" target="_blank" rel="noopener">Book a Meeting</a>
          </li>
        </ul>
      </div>
    </nav>
  </header>`;
}

function footer(depth) {
  const root = rootPrefix(depth);
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <div class="footer-brand">
            ${footerBrandMark()}
            Kaidon Labs
          </div>
          <p>Practical AI, built around how your business actually works.</p>
        </div>

        <div class="footer-col">
          <h5>Navigate</h5>
          <ul>
            <li><a href="${root}index.html#services">Services</a></li>
            <li><a href="${root}index.html#expertise">What We Do</a></li>
            <li><a href="${root}blog/">Blog</a></li>
            <li><a href="${root}index.html#contact">Contact</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Contact</h5>
          <ul>
            <li><a href="mailto:brian@kaidonlabs.tech">brian@kaidonlabs.tech</a></li>
            <li><a href="https://calendly.com/brian-kaidonlabs/30min" target="_blank" rel="noopener">Book a Meeting</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Follow</h5>
          <!-- Social links are placeholders (href="#") — replace with real profile URLs before launch -->
          <div class="footer-social">
            <a href="#" aria-label="Kaidon Labs on LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z"/></svg>
            </a>
            <a href="#" aria-label="Kaidon Labs on X (Twitter)">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.7L4.4 22H1.3l8.1-9.3L1 2h7l4.9 6.1L18.9 2Zm-1.2 18h1.9L7.4 4H5.3L17.7 20Z"/></svg>
            </a>
            <a href="#" aria-label="Kaidon Labs on GitHub">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <p>&copy; <span id="year"></span> Kaidon Labs. All rights reserved.</p>
      </div>
    </div>
  </footer>`;
}

/**
 * Wraps body HTML in the full page shell (head, header, main, footer, scripts).
 * @param {object} opts
 * @param {number} opts.depth - directory depth from project root (1 = blog/, 2 = blog/<slug>/)
 * @param {string} opts.title - document <title>
 * @param {string} opts.description - meta description / og:description
 * @param {string} opts.bodyHtml - inner HTML for <main>
 */
export function renderPage({ depth, title, description, bodyHtml }) {
  const root = rootPrefix(depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Kaidon Labs" />

  <link rel="icon" type="image/svg+xml" href="${FAVICON}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'" />

  <link rel="stylesheet" href="${root}css/styles.css" />
</head>
<body>
  ${header(depth)}

  <main id="top">
${bodyHtml}
  </main>

  ${footer(depth)}

  <script src="${root}js/script.js"></script>
</body>
</html>
`;
}

export { rootPrefix };
