// In-page helpers for the current LinkedIn activity UI.
// Exposed as window.LP.

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isCommentsPage() {
  return window.location.pathname.includes("/recent-activity/comments");
}

function isReactionsPage() {
  return window.location.pathname.includes("/recent-activity/reactions");
}

// --- Comments helpers ---

function commentMenuButtons() {
  return [...document.querySelectorAll("button")].filter((b) =>
    /View more options for .* comment/i.test(b.getAttribute("aria-label") || "")
  );
}

/*
  The comment key inside one node: the first replaceableComment_ id among its
  descendants, else its own. The card-key path and the button-key path both go
  through this one lookup, so they cannot drift apart.
*/
function commentKeyIn(node) {
  if (!node) return null;
  const rc = node.querySelector
    ? node.querySelector("[id^='replaceableComment_']")
    : null;
  if (rc) return rc.id;
  if (node.id && node.id.startsWith("replaceableComment_")) return node.id;
  return null;
}

function commentKeyForButton(btn) {
  let node = btn;
  for (let i = 0; i < 25 && node; i++) {
    const key = commentKeyIn(node);
    if (key) return key;
    node = node.parentElement;
  }
  return null;
}

function collectCommentKeys() {
  const keys = new Set();
  for (const btn of commentMenuButtons()) {
    const k = commentKeyForButton(btn);
    if (k) keys.add(k);
  }
  return [...keys];
}

// --- Reactions helpers ---

// The predicate that identifies a reaction button. One definition, so the
// growth signal, the collectors and the delete flows all agree on what one is.
function isReactionButton(btn) {
  return /^Reaction button state:/i.test(btn.getAttribute("aria-label") || "");
}

function reactionButtons() {
  return [...document.querySelectorAll("button")].filter(isReactionButton);
}

function reactionState(btn) {
  return (btn.getAttribute("aria-label") || "")
    .replace(/^Reaction button state:\s*/i, "")
    .trim();
}

function reactionKeyForIndex(idx) {
  return idx >= 0 ? `reaction:${idx}` : null;
}

function reactionKeyForButton(btn) {
  /*
  The card keeps its place among the reaction buttons for the life of the
  page session: an unliked card stays put with state "no reaction" until the
  page is reloaded, and then it disappears. The index is therefore a
  session-scoped key, not one that survives a reload (permalinks are not
  reachable per item in this UI).
*/
  const all = reactionButtons();
  return reactionKeyForIndex(all.indexOf(btn));
}

function collectReactionKeys() {
  const keys = new Set();
  reactionButtons().forEach((btn, idx) => {
    if (reactionState(btn).toLowerCase() === "no reaction") return;
    const k = reactionKeyForIndex(idx);
    if (k) keys.add(k);
  });
  return [...keys];
}

/*
  Extract post author + date from the reaction/comment card's container.
  This is the single canonical card-metadata extractor: the scan path and both
  delete flows all call it on the card, so every record for the same item
  carries the same author and dateTime.
  "author" is the post author (not the account that performed the like/comment).
  container should be the role="listitem" ancestor of the button.
  Interpretation of the LinkedIn card DOM:

  On a reaction card, the POSTER is not the REACTOR. The visible name the
  user sees on the reactions page is the header actor of the card: the
  poster's avatar + name link + headline text. For company posts the header
  shows the company name ("Zebraworks") and no headline (companies have no
  personal headline) - the headline cell stays blank.

  The aria-label "Open control menu for post by X" is NOT reliable for the
  header actor: for company posts LinkedIn puts the PERSON who posted on
  behalf of the company there ("Erin Barrio"), while the header still shows
  "Zebraworks". That is exactly the mismatch the user reported:
  scan-likes.json had "Erin Barrio" for reaction:13/14/15 while the page
  shows "Zebraworks".

  So the extractor prefers the VISIBLE header actor:
  1. The first /in/ or /company/ link in DOM order whose text is a name
  (the header actor block comes before body and footer links).
  2. The aria-label on the control menu button (fallback only).

  COUNTER-ARGUMENT considered and rejected: "if the aria-label says post by
  Erin Barrio, Erin IS the author - the header is just decoration." No: the
  user reviews the reactions page and picks items by what they SEE there.
  The Author column is a review aid, not a provenance record. Showing
  "Zebraworks" (visible) is correct; showing "Erin Barrio" (hidden) is a
  surprise that cannot be verified from the page.
*/

function extractAuthorAndDate(container) {
  /*
  1. The visible header actor: the /in/ or /company/ link in DOM order whose
  text is a plausible person/company name. The header actor block precedes
  body and footer links, so the earliest match is the name the page shows.
  Skips UI text ("likes this", "X commented this", reaction-state phrases)
  and the ellipsis placeholder.

  The account whose activity is being purged ("me") is derived from the page
  URL (/in/<username>/...) and is never mistaken for the poster: author is
  always the post author, never "me".

  For comments the page often wraps the viewer's own profile badge inside
  the first /in/ link ("Verified Profile You ... Implementation Consultant @
  nQ Zebraworks"). Pulling link.textContent there would leak all of that into
  the Author column. For comments we therefore extract just the display name
  from the name span inside the link; likes keep link.textContent unchanged
  (their authors already come out clean, e.g. "Brad Bassham • 1st").
*/
  const viewerName = viewerNameFromPageUrl();
  let author = null;
  const authorLinks = container.querySelectorAll(
    "a[href*='/in/'], a[href*='/company/']"
  );
  for (const link of authorLinks) {
    const text = (link.textContent || "").trim();
    if (!isPlausibleAuthorName(text, viewerName)) continue;
    author = text;
    break;
  }
  /*
  2. Fallback: the "Open control menu for post by X" button has the poster
  name in its aria-label. For company posts this can be the person who
  posted on behalf, not the visible header actor - which is why this is
  only a fallback (see the module note above).
*/
  if (!author) {
    const menuBtn = container.querySelector(
      "button[aria-label*='Open control menu for post by']"
    );
    if (menuBtn) {
      const al = menuBtn.getAttribute("aria-label") || "";
      const m = al.match(/post by (.+)$/i);
      if (m) {
        const name = m[1]
          .trim()
          .replace(/["'’]+$/g, "")
          .trim();
        if (isPlausibleAuthorName(name, viewerName)) author = name;
      }
    }
  }

  /*
  Look for a date-like text in the card (Month + day pattern like "Sep 16").
  Allow trailing text like " • Edited" or other suffixes - just extract the date part.
  Normalized to "Oct 5, 2026" when a year is present, else "Oct 5".
*/
  let dateTime = null;
  // Match month name + valid day (01-31), optional year. Reject garbage like "Oct 81".
  const dateRe =
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+((?:0?[1-9]|[12]\d|3[01]))(?:\s*,\s*(\d{4}))?/;
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const toDisplayDate = (monthIdx, dayNum, year) =>
    MONTHS[monthIdx] + " " + dayNum + (year ? ", " + year : "");
  const monthIndex = (token) => MONTHS.indexOf(token.slice(0, 3));
  // Prefer the <time> element's ISO datetime (gives the year, so the display
  // can carry it), then fall back to the visible month/day text.
  const timeEl = container.querySelector("time[datetime]");
  if (timeEl && timeEl.dateTime) {
    const iso = String(timeEl.dateTime).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso)
      dateTime = toDisplayDate(Number(iso[2]) - 1, Number(iso[3]), iso[1]);
  }
  if (!dateTime) {
    const candidates = [
      ...container.querySelectorAll("span, p, div, a, time, li"),
    ];
    for (const el of candidates) {
      const t = (el.textContent || "").trim();
      const m = t.match(dateRe);
      if (m) {
        dateTime = toDisplayDate(monthIndex(m[1]), Number(m[2]), m[3] || null);
        break;
      }
    }
  }
  // If still no date, try any <time> without datetime (text content).
  if (!dateTime) {
    const timeText = container.querySelector("time");
    if (timeText && timeText.textContent) {
      const t = timeText.textContent.trim();
      const m = t.match(dateRe);
      if (m)
        dateTime = toDisplayDate(monthIndex(m[1]), Number(m[2]), m[3] || null);
    }
  }
  // Relative dates: "1mo", "1w", "3d", "5h". These can't be converted to a
  // calendar date without knowing when the scan ran, so report them verbatim.
  if (!dateTime) {
    const relRe = /(\d+)\s*(mo|w|d|h)\b/i;
    const candidates = [
      ...container.querySelectorAll("span, p, div, a, time, li"),
    ];
    for (const el of candidates) {
      const t = (el.textContent || "").trim();
      const m = t.match(relRe);
      if (m) {
        dateTime = m[0];
        break;
      }
    }
  }
  /*
  Headline: the small job-title line under the header actor's name.
  Company posts have no personal headline, so this stays null (blank
  column) for them - exactly what the user asked for.
*/
  let headline = null;
  const headlineSelectors = [
    ".feed-shared-update-v2__actor--headline",
    ".feed-shared-actor__sub-description",
    ".update-components-text--headline",
    "[class*='actor__headline']",
    "[class*='headline']",
    ".artdeco-entity-lockup__subtitle",
    "[class*='sub-description']",
  ];
  for (const sel of headlineSelectors) {
    const el = container.querySelector(sel);
    if (!el) continue;
    const t = (el.textContent || "").trim();
    if (
      t &&
      t.length > 1 &&
      t !== author &&
      !isPlausibleAuthorName(t, viewerName)
    ) {
      headline = t.replace(/\s+/g, " ").slice(0, 120);
      break;
    }
  }
  /*
  Carve the headline out of a text block that pairs the author name with
  the degree suffix and relative date, e.g.
  "Brad Bassham  • 1stSenior Client Portfolio Manager at Intapp1mo".
*/
  if (!headline && author) {
    const strippedAuthor = stripDegreeSuffix(author);
    const blocks = [
      ...container.querySelectorAll("span, p, div, a, time, li"),
    ].map((el) => (el.textContent || "").trim());
    for (const block of blocks) {
      if (!block.startsWith(strippedAuthor)) continue;
      let rest = block.slice(strippedAuthor.length);
      rest = rest.replace(/^\s*•\s*/, "");
      rest = rest.replace(/^\s*\d+(st|nd|rd|th)?\+?\s*/, "");
      const mDate = rest.match(/\d+\s*(mo|w|d|h)\b/i);
      const candidate = mDate ? rest.slice(0, mDate.index) : rest;
      const clean = candidate.replace(/\s+/g, " ").trim();
      if (
        clean &&
        clean.length > 1 &&
        clean !== author &&
        clean !== strippedAuthor &&
        !isPlausibleAuthorName(clean, viewerName)
      ) {
        headline = clean.slice(0, 120);
        break;
      }
    }
  }
  return { author, dateTime, headline };
}

/*
  Strip a LinkedIn connection-degree suffix from a poster name:
  "Brad Bassham  • 1st" -> "Brad Bassham"
  "Yusuf. M • 3rd+" -> "Yusuf. M"
  "The Recruiter.com Network" -> unchanged
*/
function stripDegreeSuffix(text) {
  return text.replace(/\s*•\s*\d+(st|nd|rd|th)?\+?\s*$/, "").trim();
}

/*
  Derive the account whose activity is being purged ("me") from the page URL,
  e.g. https://www.linkedin.com/in/eric-derewonko/recent-activity/comments/.
  Returns null when the URL carries no /in/<username>/ segment (for example
  when the extractor is exercised outside a real page in a unit test).
*/
function viewerNameFromPageUrl() {
  try {
    if (typeof window === "undefined" || !window.location) return null;
    const m = String(window.location.pathname || "").match(/\/in\/([^/]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/*
  Decide whether a piece of link text is a plausible author/poster name.
  viewName is the account being purged ("me") and is never a plausible author.
  Reaction-count strings ("187 reactions"), UI phrases and placeholders are
  rejected so they can never leak into the Author column.
  Names are compared after normalizing (case, spaces vs dashes) because the
  viewer name from the URL is a slug while the link text is the display name.
*/
function normalizeName(text) {
  return String(text || "")
    .replace(/\W/g, "")
    .toLowerCase();
}

function isPlausibleAuthorName(text, viewerName) {
  if (!text || text.length < 2) return false;
  if (viewerName && normalizeName(text) === normalizeName(viewerName))
    return false; // never "me"
  if (/^\.\.\.$/.test(text)) return false; // ellipsis placeholder
  if (/^\d+\s+(reactions?|likes?|comments?|mentions?|reposts?)$/i.test(text))
    return false; // "187 reactions"
  if (/^(likes?|reposted|commented on)\s+this$/i.test(text)) return false;
  if (/finds? this (?:funny|love|inspire|celebrate)s?$/i.test(text))
    return false;
  if (/@/.test(text)) return false; // email-ish or "name @ company" headline
  if (/\|\s*\w/.test(text)) return false; // "name | company" headline
  if (
    /\b(consultant|engineer|manager|director|founder|ceo|cto|lead|specialist|analyst|recruiter|owner)\b/i.test(
      text
    )
  )
    return false; // job-title words, not a name
  return true;
}

function cleanText(str, maxLen) {
  if (!str) return null;
  const cleaned = str.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3).trim() + "...";
}

function extractCommentText(card, authorLinks) {
  if (!authorLinks) authorLinks = [];
  /*
  Comment body text inside the comment card. Try multiple selectors
  (LinkedIn's class names change between versions); fall back to the longest
  meaningful ltr text span, which is the comment body rather than the short
  author/date metadata or UI chrome.
*/
  const selectors = [
    ".update-components-text",
    ".comment-item__text",
    ".feed-shared-update-v2__description",
    ".comments-comment-item__main-content",
    "[class*='comment-text']",
    "[class*='comment-body']",
    "[class*='comment-content']",
    ".break-words",
  ];
  for (const sel of selectors) {
    const el = card.querySelector(sel);
    if (el) {
      const text = cleanText(el.textContent, 280);
      if (text) return stripAuthorPrefixesFromText(text, authorLinks);
    }
  }
  /*
  Fallback: scan all text-bearing elements for the comment body.
  Comment bodies are longer than author/date metadata or UI chrome, and
  they never carry the viewer's profile badge (which contains "@" or "|").
  Skip elements whose text starts with UI garbage ("Feed post",
  "<viewer> commented", "<viewer> <relative date>") because parent elements
  concatenate everything into one long string.
*/
  const viewer = viewerNameFromPageUrl() || "";
  const garbagePrefixes = ["Feed post", viewer + " commented", viewer + " •"];
  const els = [...card.querySelectorAll("span, p, div, a, time, li")];
  let best = null;
  for (const el of els) {
    const text = cleanText(el.textContent, 280);
    if (!text || text.length <= 2) continue;
    if (/^(liked|commented|reposted|reacted)$/i.test(text)) continue;
    if (
      /^(feed post|new comment in your group|load more comments)$/i.test(text)
    )
      continue;
    if (/^\d+(,\d+)*\s*impressions?\b/i.test(text)) continue; // "111,124 impressions"
    if (/@/.test(text) || /\|\s*\w/.test(text)) continue; // viewer badge garbage
    let isGarbage = false;
    for (const prefix of garbagePrefixes) {
      if (text.startsWith(prefix)) {
        isGarbage = true;
        break;
      }
    }
    if (isGarbage) continue;
    if (!best || text.length > best.length) best = text;
  }
  if (best) {
    best = stripAuthorPrefixesFromText(best, authorLinks);
  }
  return best;
}

function extractPostExcerpt(card, isComment = false) {
  /*
  Post body excerpt from the card. For likes, this is the post text the user
  reacted to; for comments there is no reliably accessible post body, so it
  stays null.
*/
  const selectors = [
    ".feed-shared-update-v2__description",
    ".feed-shared-update-v2__sub-description",
    ".update-components-text",
    ".break-words",
    "span[dir='ltr']",
  ];
  if (!isComment) {
    /*
    LinkedIn obfuscates class names per deploy. In the current DOM the like
    post body lives in a <p> carrying a class that contains 'gvyles'; keep
    this selector as a stopgap and fall back to content-based extraction
    below when LinkedIn changes its markup.
*/
    selectors.push("p.gvyles", "[class*='gvyles']");
  }
  for (const sel of selectors) {
    const els = card.querySelectorAll(sel);
    for (const el of els) {
      const text = cleanText(el.textContent, 280);
      if (text && isPlausiblePostText(text, viewerNameFromPageUrl()))
        return text;
    }
  }
  return null;
}

/*
  Decide whether a piece of text is a plausible post body (not UI chrome).
  Rejects short UI strings, reaction counts, impression counts, and the
  viewer's own badge text.
*/
function isPlausiblePostText(text, viewerName) {
  if (!text || text.length < 5) return false;
  if (/^(liked|commented|reposted|reacted)$/i.test(text)) return false;
  if (/^(feed post|new comment in your group|load more comments)$/i.test(text))
    return false;
  if (
    /^\d+(,\d+)*\s*(reactions?|likes?|comments?|mentions?|reposts?|impressions?)\b/i.test(
      text
    )
  )
    return false;
  if (viewerName && text.startsWith(viewerName)) return false;
  if (/@/.test(text) || /\|\s*\w/.test(text)) return false;
  return true;
}

/*
  Strip author link texts and relative dates from the start and end of a
  comment text. Parent elements concatenate [company][author][degree][date][body],
  so removing author/date bookends reveals the comment body.
*/
function stripAuthorPrefixesFromText(text, authorLinks) {
  if (!authorLinks) return text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of authorLinks) {
      const linkText = stripDegreeSuffix((link.textContent || "").trim());
      if (!linkText) continue;
      // Strip from start
      if (text.startsWith(linkText)) {
        text = text
          .slice(linkText.length)
          .replace(/^\s*•\s*/, "")
          .trim();
        changed = true;
        break;
      }
      // Strip from end
      if (text.endsWith(linkText)) {
        text = text
          .slice(0, -linkText.length)
          .replace(/\s*•\s*$/, "")
          .trim();
        changed = true;
        break;
      }
    }
    // Strip degree suffix from start (" • 1st", "1st", "3rd+")
    const mDeg = text.match(/^\s*(•\s*)?\d+(st|nd|rd|th)?\+?\s*/);
    if (mDeg) {
      text = text.slice(mDeg[0].length).trim();
      changed = true;
    }
    // Strip relative date from start ("1mo", "1w", "3d")
    const mRelStart = text.match(/^\s*(\d+)\s*(mo|w|d|h)\s*/i);
    if (mRelStart) {
      text = text.slice(mRelStart[0].length).trim();
      changed = true;
    }
    // Strip relative date from end ("1mo", "1w", "3d")
    const mRelEnd = text.match(/\s*(\d+)\s*(mo|w|d|h)\s*$/i);
    if (mRelEnd) {
      text = text.slice(0, -mRelEnd[0].length).trim();
      changed = true;
    }
  }
  return text;
}

// Find the nearest role="listitem" ancestor (the card) from a button.
function findCard(btn) {
  let el = btn;
  for (let i = 0; i < 30 && el; i++) {
    if (el.getAttribute && el.getAttribute("role") === "listitem") return el;
    el = el.parentElement;
  }
  return null;
}

/*
  The one card-metadata reader: resolve the pristine card, pick up its post
  link, then hand the card to extractAuthorAndDate (still the sole
  author/date extractor). Returns { postHref, author, dateTime } with null
  fallbacks when the card or its pieces are absent. The scan path and both
  delete flows read through here, so every record for the same card comes
  from one place.
*/
function readCardMeta(btn, isComment = false) {
  const meta = {
    cardId: null,
    text: null,
    postExcerpt: null,
    postHref: null,
    author: null,
    dateTime: null,
  };
  const card = findCard(btn);
  if (card) {
    if (card.id) meta.cardId = card.id;
    const authorLinks = card.querySelectorAll(
      "a[href*='/in/'], a[href*='/company/']"
    );
    if (isComment) meta.text = extractCommentText(card, authorLinks);
    meta.postExcerpt = extractPostExcerpt(card, isComment);
    const feedLink = card.querySelector("a[href*='/feed/update/']");
    if (feedLink) meta.postHref = feedLink.getAttribute("href");
    Object.assign(meta, extractAuthorAndDate(card));
  }
  return meta;
}

/*
  Collect rich metadata for each reaction item (state, author, postHref, dateTime).
  Keys already seen are skipped before metadata extraction, so a deep walk reads
  each card once instead of re-reading the whole list on every load step.
  Link capture constants: menu polling budget, capture budget, poll cadence and
  the single retry allowed when a menu or capture misses.
*/
const LINK_MENU_TIMEOUT_MS = 2000;
const LINK_CAPTURE_TIMEOUT_MS = 2000;
const LINK_POLL_INTERVAL_MS = 100;
const LINK_RETRY_COUNT = 1;

/*
  Capture one link from a card by opening a menu button, choosing the right
  "Copy link to ..." item, and hooking the page's own clipboard write. Returns
  the captured URL or null when the menu or the capture never arrives; a
  missing link never throws, so an unsupported card just yields null.
  `menuBtn` is the element whose click opens the menu offering the wanted link.
  When omitted the caller falls back to the card's post control menu
  ("Open control menu"), which is correct for reactions but not for comments:
  comments must open their own comment menu button ("View more options for ... comment"),
  which offers "copy link to comment".
*/
async function captureCardLink(card, menuBtn, isComment) {
  if (!card) return null;
  if (!menuBtn) {
    menuBtn = card.querySelector("button[aria-label*='Open control menu']");
  }
  if (!menuBtn) return null;
  const wanted = isComment ? "copy link to comment" : "copy link to post";

  for (let attempt = 0; attempt <= LINK_RETRY_COUNT; attempt++) {
    let captured = null;
    const clipboard = navigator.clipboard;
    const originalWriteText = clipboard ? clipboard.writeText : null;
    if (clipboard) {
      clipboard.writeText = (text) => {
        captured = text;
        return Promise.resolve();
      };
    }
    const copyListener = (e) => {
      try {
        const text = e.clipboardData
          ? e.clipboardData.getData("text/plain")
          : null;
        if (text) captured = text;
      } catch {
        // ignore
      }
    };
    document.addEventListener("copy", copyListener);

    try {
      menuBtn.click();
      let option = null;
      const menuDeadline = Date.now() + LINK_MENU_TIMEOUT_MS;
      while (Date.now() < menuDeadline && !option) {
        const candidates = [
          ...document.querySelectorAll(
            "button, [role='menuitem'], [role='option'], a"
          ),
        ];
        option = candidates.find((el) => {
          if (el.offsetParent === null && el !== document.body) return false;
          const label = (el.innerText || el.textContent || "")
            .trim()
            .toLowerCase();
          return label === wanted;
        });
        if (!option) await sleep(LINK_POLL_INTERVAL_MS);
      }
      if (option) {
        option.click();
        const captureDeadline = Date.now() + LINK_CAPTURE_TIMEOUT_MS;
        while (Date.now() < captureDeadline && !captured) {
          await sleep(LINK_POLL_INTERVAL_MS);
        }
      }
    } catch {
      // ignore; retry below
    } finally {
      document.removeEventListener("copy", copyListener);
      if (clipboard && originalWriteText)
        clipboard.writeText = originalWriteText;
    }

    try {
      document.body.click();
    } catch {
      /* ignore */
    }
    await sleep(100);

    if (captured) return captured;
  }
  return null;
}

async function collectReactionItems(seenKeys, links) {
  const seen = new Set(seenKeys || []);
  const items = [];
  const buttons = reactionButtons();
  for (let idx = 0; idx < buttons.length; idx++) {
    const btn = buttons[idx];
    const state = reactionState(btn);
    if (state.toLowerCase() === "no reaction") continue;
    const key = reactionKeyForIndex(idx);
    if (!key || seen.has(key)) continue;
    const meta = readCardMeta(btn, false);
    let itemHref = null;
    if (links) {
      const card = findCard(btn);
      itemHref = await captureCardLink(card, null, false);
    }
    items.push({
      key,
      cardId: meta.cardId,
      text: null,
      postExcerpt: meta.postExcerpt,
      state,
      author: meta.author,
      headline: meta.headline,
      postHref: meta.postHref,
      itemHref,
      dateTime: meta.dateTime,
    });
  }
  return items;
}

/*
  Collect rich metadata for each comment item (author, postHref, dateTime).
  Same incremental contract as reactions: keys already seen are skipped before
  metadata extraction.
*/
async function collectCommentItems(seenKeys, links) {
  const items = [];
  const seen = new Set(seenKeys || []);
  for (const btn of commentMenuButtons()) {
    const key = commentKeyForButton(btn);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const meta = readCardMeta(btn, true);
    let itemHref = null;
    if (links) {
      const card = findCard(btn);
      itemHref = await captureCardLink(card, btn, true);
    }
    items.push({
      key,
      cardId: meta.cardId,
      text: meta.text,
      postExcerpt: meta.postExcerpt,
      author: meta.author,
      headline: meta.headline,
      postHref: meta.postHref,
      itemHref,
      dateTime: meta.dateTime,
    });
  }
  return items;
}

// --- Shared ---

function collectCardIds() {
  return activityCards()
    .map((card) => card.id)
    .filter(Boolean);
}

function collectKeys() {
  if (isCommentsPage()) return collectCommentKeys();
  if (isReactionsPage()) return collectReactionKeys();
  return [];
}

async function collectItems(seenKeys, links) {
  if (isCommentsPage()) return collectCommentItems(seenKeys, links);
  if (isReactionsPage()) return collectReactionItems(seenKeys, links);
  return [];
}

// --- Activity List traversal helpers ---

// The Activity List's cards. Both tabs render them as role="listitem" and
// neither virtualizes: cards accumulate as more of the list loads.
function activityCards() {
  return [...document.querySelectorAll('[role="listitem"]')];
}

/*
  The element that actually scrolls the Activity List: the nearest scrollable
  ancestor of a card, then the element with id "workspace", then the main
  landmark, then the document scroller. Measured today, all of them land on
  #workspace, but the derivation order is what survives a rename.
*/
function activityScrollTarget() {
  let node = activityCards()[0] || null;
  for (let i = 0; i < 20 && node; i++) {
    const cs = getComputedStyle(node);
    if (
      (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 40
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return (
    document.getElementById("workspace") ||
    document.querySelector("main, [role='main']") ||
    document.scrollingElement ||
    document.documentElement
  );
}

// Scroll the Activity List to its bottom and name the element used, so the
// caller can log which scroller the walk relied on.
function scrollActivityListToBottom() {
  const target = activityScrollTarget();
  if (!target) return { tag: null, id: null };
  target.scrollTo(0, target.scrollHeight);
  const cards = activityCards();
  if (cards.length) cards[cards.length - 1].scrollIntoView({ block: "end" });
  return { tag: target.tagName || null, id: target.id || null };
}

/*
  The key of one card, computed without reading its metadata: the comment id
  path, or the reaction-button predicate plus the session-scoped reaction
  index. Both come from the collectors' own helpers, so the growth signal and
  the collectors can never disagree about a card's key.
*/
function cardKey(card) {
  if (isCommentsPage()) return commentKeyIn(card);
  if (isReactionsPage()) {
    const btn = [...card.querySelectorAll("button")].find(isReactionButton);
    return btn ? reactionKeyForButton(btn) : null;
  }
  return null;
}

/*
  Cheap growth signal: the Activity List's scroll height, its card count and
  the last card's key. Never extracts card metadata, so polling it while the
  list grows to hundreds of cards stays cheap. Growth of any of the three means
  the page loaded more content.
*/
function readGrowthSignal() {
  const cards = activityCards();
  const target = activityScrollTarget();
  /*
  The last keyed card, not merely the last element in the list: LinkedIn ends
  the list with tiles that carry no key (a "load more" sentinel, a
  placeholder), and taking that tile left lastKey permanently null, which
  blinded the cheapest growth clue the walk has.
*/
  let lastKey = null;
  for (let i = cards.length - 1; i >= 0 && lastKey == null; i--)
    lastKey = cardKey(cards[i]);
  return {
    scrollHeight: target ? target.scrollHeight : 0,
    count: cards.length,
    lastKey,
  };
}

// --- Delete comment flow ---

/*
  Comments have no per-item state (unlike reactions there is no stateful
  button on the card), so a deleted comment records the activity itself as its
  state. A stable constant keeps comment results the same shape as reaction
  results, where state is always a real, non-null value.
*/
const COMMENTS_STATE = "Commented";

async function deleteCommentButton(btn) {
  btn.click();
  await sleep(800);

  // find delete option in the opened menu/popover
  let deleteOption = null;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && !deleteOption) {
    const candidates = [
      ...document.querySelectorAll(
        "button, [role='menuitem'], [role='option']"
      ),
    ].filter(
      (e) =>
        e.offsetParent !== null &&
        (e.innerText || "").trim().toLowerCase() === "delete"
    );
    deleteOption = candidates[0] || null;
    if (!deleteOption) await sleep(200);
  }
  if (!deleteOption) {
    document.body.click();
    await sleep(300);
    return { ok: false, skip: true, error: "no delete option" };
  }
  deleteOption.click();
  await sleep(800);

  // confirm modal
  let modalDelete = null;
  const mdeadline = Date.now() + 4000;
  while (Date.now() < mdeadline && !modalDelete) {
    const candidates = [...document.querySelectorAll("button")].filter(
      (b) =>
        b.offsetParent !== null &&
        (b.innerText || "").trim().toLowerCase() === "delete"
    );
    // prefer the one inside a dialog
    const inDialog = candidates.find((b) =>
      b.closest("[role='dialog'], [role='alertdialog']")
    );
    modalDelete = inDialog || candidates[candidates.length - 1] || null;
    if (!modalDelete) await sleep(200);
  }
  if (!modalDelete) {
    document.body.click();
    await sleep(300);
    return { ok: false, skip: true, error: "confirm failed" };
  }
  modalDelete.click();
  await sleep(1500);

  // verify the comment's replaceableComment_ container is gone or menu button gone
  const key = commentKeyForButton(btn);
  const stillThere = key ? !!document.getElementById(key) : false;
  if (stillThere) {
    // maybe not removed; could be rate limit
    return {
      ok: false,
      skip: false,
      error: "deletion did not complete (possible rate limit)",
    };
  }
  return { ok: true, key };
}

// --- Delete one card (by Card Identity) ---

/*
  Act on exactly one card, named by its Card Identity (the id of the card's
  own container element, which the collectors record as `cardId`). Nothing
  here hunts for a positional key: the caller names the card, the card
  names itself. Failures are named ("refused: ..." / "card not found"),
  never retried inside the page. The result always carries the cardId.
*/
async function deleteOneCard(cardId) {
  if (!cardId) {
    return {
      ok: false,
      skip: false,
      cardId: null,
      error: "cardId is required",
    };
  }
  const card = document.getElementById(cardId);
  if (!card) {
    return { ok: false, skip: false, cardId, error: "card not found" };
  }

  if (isCommentsPage()) {
    const btn = [...card.querySelectorAll("button")].find((b) =>
      /View more options for .* comment/i.test(
        b.getAttribute("aria-label") || ""
      )
    );
    if (!btn) {
      return {
        ok: false,
        skip: false,
        cardId,
        error: "refused: comment menu button not found in card",
      };
    }
    const meta = readCardMeta(btn, true);
    const res = await deleteCommentButton(btn);
    if (!res.ok) {
      return {
        ...res,
        ok: false,
        skip: false,
        cardId,
        key: res.key || null,
        error: `refused: ${res.error || "comment still present"}`,
        state: COMMENTS_STATE,
        author: meta.author,
        postHref: meta.postHref,
        dateTime: meta.dateTime,
      };
    }
    return {
      ok: true,
      cardId,
      key: res.key || null,
      state: COMMENTS_STATE,
      author: meta.author,
      postHref: meta.postHref,
      dateTime: meta.dateTime,
    };
  }

  if (isReactionsPage()) {
    const btn = [...card.querySelectorAll("button")].find(isReactionButton);
    if (!btn) {
      return {
        ok: false,
        skip: false,
        cardId,
        error: "refused: no reaction button found in card",
      };
    }
    const meta = readCardMeta(btn, false);
    const key = reactionKeyForButton(btn);
    btn.click();
    await sleep(1500);
    const newState = reactionState(btn);
    if (newState.toLowerCase() !== "no reaction") {
      return {
        ok: false,
        skip: false,
        cardId,
        key,
        error: "refused: reaction not removed (possible rate limit)",
        state: newState,
        author: meta.author,
        postHref: meta.postHref,
        dateTime: meta.dateTime,
      };
    }
    return {
      ok: true,
      cardId,
      key,
      state: newState,
      author: meta.author,
      postHref: meta.postHref,
      dateTime: meta.dateTime,
    };
  }

  return { ok: false, skip: false, cardId, error: "not on a supported page" };
}

// --- window.LP ---
window.LP = {
  isCommentsPage,
  isReactionsPage,
  collectKeys,
  collectCardIds,
  collectItems,
  readGrowthSignal,
  scrollActivityListToBottom,
  deleteOneCard,
};
