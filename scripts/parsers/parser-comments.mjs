import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(
  __dirname,
  "..",
  "tests",
  "comments-input-test-202611.html"
);

// BEGIN extract (pure DOM code: only standard DOM APIs, no jsdom specifics)
function extractComments(document) {
  const EXCERPT_MAX = 280;
  const HEADLINE_MAX = 120;
  const TEXT_BOX = 'span[data-testid="expandable-text-box"]';

  const squash = (s) => (s || "").replace(/\s+/g, " ").trim();
  // excerpt: max 280 chars including the trailing "..."; headline: hard cut at 120
  const excerpt = (s) =>
    s.length > EXCERPT_MAX ? s.slice(0, EXCERPT_MAX - 3).trimEnd() + "..." : s;

  // LinkedIn wraps outbound links in /safety/go/?url=...; prefer the real target.
  function realHref(a) {
    const label = a.getAttribute("aria-label") || "";

    if (/^Open https?:\/\//.test(label)) return label.slice(5).trim();
    const href = a.getAttribute("href") || "";

    try {
      const u = new URL(href, "https://www.linkedin.com");

      if (u.pathname.startsWith("/safety/go"))
        return u.searchParams.get("url") || href;
    } catch {
      /* ignore */
    }

    return href;
  }

  // external = not a linkedin.com page (lnkd.in short links count as external)
  const isExternal = (href) => {
    try {
      return !/(^|\.)linkedin\.com$/i.test(
        new URL(href, "https://www.linkedin.com").hostname
      );
    } catch {
      return false;
    }
  };

  // Readable text of an expandable-text-box. Links become their real URL,
  // buttons ("...more") are dropped, <br> becomes a newline.
  function boxText(box, { keepNewlines }) {
    const clone = box.cloneNode(true);
    clone.querySelectorAll("button").forEach((b) => b.remove());
    clone.querySelectorAll("a").forEach((a) => {
      const href = realHref(a);

      if (href && isExternal(href)) a.textContent = href;
    });
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const raw = clone.textContent;

    if (!keepNewlines) return squash(raw);

    return raw
      .split("\n")
      .map(squash)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const cards = Array.from(
    document.querySelectorAll('[componentkey^="replaceableComment_"]')
  );

  return cards.map((card) => {
    const key = card.getAttribute("componentkey");
    const update =
      card.closest('[componentkey^="update-card-focus"]') || card.parentElement;
    const commentsSection = card.closest(
      '[componentkey^="commentsSectionContainer"]'
    );
    const inComments = (el) => commentsSection && commentsSection.contains(el);

    // --- my comment: first text box inside the comment card itself
    const commentBox = card.querySelector(TEXT_BOX);
    const comment = commentBox
      ? boxText(commentBox, { keepNewlines: true })
      : "";

    // --- the post: first text box that is NOT inside the comments section
    const postBox = Array.from(update.querySelectorAll(TEXT_BOX)).find(
      (b) => !inComments(b)
    );
    const postText = postBox ? boxText(postBox, { keepNewlines: false }) : "";

    // --- post header: everything after the <hr> that follows the "X commented" line
    const hr = update.querySelector("hr");
    const header = hr ? hr.nextElementSibling : update;

    let author = null,
      headline = null,
      dateTime = null;

    if (header) {
      // Header <p>s in document order, e.g.
      //   person : [name, "• 3rd+", headline, time]
      //   group  : [group name, "author • 3rd+", time]
      //   company: [company, time]
      const ps = Array.from(header.querySelectorAll("p")).map((p) =>
        squash(p.textContent)
      );
      const timeIdx = ps.findIndex((t) => /^\d+\s?(s|m|h|d|w|mo|yr)\b/.test(t));

      if (timeIdx >= 0) dateTime = ps[timeIdx].replace(/\s*•\s*Edited$/, "");

      const parts = (timeIdx >= 0 ? ps.slice(0, timeIdx) : ps).filter(
        (t) => t && !/^(Visit my website|Follow|Following|Connect)$/i.test(t)
      );

      const firstLink = header.querySelector("a[href]");
      const isGroup =
        !!firstLink && /\/groups\//.test(firstLink.getAttribute("href"));

      if (isGroup) parts.shift(); // group name, the author comes next

      author = parts[0] || null;
      let i = 1;

      if (author && parts[i] && /^•\s*(1st|2nd|3rd\+?)/.test(parts[i])) {
        author += " " + parts[i];
        i++;
      }

      headline = parts[i] ? parts[i].slice(0, HEADLINE_MAX) : null;
    }

    // --- links: first external link inside the post text; permalink if present
    let itemHref = null;

    if (postBox) {
      const hrefs = Array.from(postBox.querySelectorAll("a"))
        .map(realHref)
        .filter((h) => h && isExternal(h));

      itemHref = hrefs.find((h) => /lnkd\.in\//.test(h)) || hrefs[0] || null;
    }

    const permalink = Array.from(update.querySelectorAll("a[href]"))
      .filter((a) => !inComments(a))
      .map((a) => a.getAttribute("href"))
      .find((h) => /\/feed\/update\/|\/posts\//.test(h));

    return {
      key,
      comment,
      postExcerpt: excerpt(postText),
      author,
      headline,
      postHref: permalink || null,
      itemHref,
      dateTime,
      step: 0,
      status: "no-op",
    };
  });
}
// END extract

const dom = new JSDOM(fs.readFileSync(htmlPath, "utf-8"));
const results = extractComments(dom.window.document);

fs.writeFileSync(
  path.join(__dirname, "comments.json"),
  JSON.stringify(results, null, 2)
);

console.log(JSON.stringify(results, null, 2));
