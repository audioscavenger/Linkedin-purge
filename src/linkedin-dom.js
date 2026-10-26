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

function commentKeyForButton(btn) {
  let node = btn;
  for (let i = 0; i < 25 && node; i++) {
    const rc = node.querySelector ? node.querySelector("[id^='replaceableComment_']") : null;
    if (rc) return rc.id;
    if (node.id && node.id.startsWith("replaceableComment_")) return node.id;
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

function reactionButtons() {
  return [...document.querySelectorAll("button")].filter((b) =>
    /^Reaction button state:/i.test(b.getAttribute("aria-label") || "")
  );
}

function reactionState(btn) {
  return (btn.getAttribute("aria-label") || "").replace(/^Reaction button state:\s*/i, "").trim();
}

function reactionKeyForButton(btn) {
  // The activity list keeps unliked items in place (state "no reaction"), so the
  // button's index among all reaction buttons is stable across runs and serves
  // as a checkpoint key (permalinks are not reachable per item in this UI).
  const all = reactionButtons();
  const idx = all.indexOf(btn);
  return idx >= 0 ? `reaction:${idx}` : null;
}

function collectReactionKeys() {
  const keys = new Set();
  for (const btn of reactionButtons()) {
    if (reactionState(btn).toLowerCase() === "no reaction") continue;
    const k = reactionKeyForButton(btn);
    if (k) keys.add(k);
  }
  return [...keys];
}

// Extract post author + date from the reaction/comment card's container.
// "author" is the post author (not the account that performed the like/comment).
// container should be the role="listitem" ancestor of the button.
function extractAuthorAndDate(container) {
  let author = null;
  // The "Open control menu for post by X" button has the post author name
  // in its aria-label. This is the most reliable source.
  const menuBtn = container.querySelector("button[aria-label*='Open control menu for post by']");
  if (menuBtn) {
    const al = menuBtn.getAttribute("aria-label") || "";
    const m = al.match(/post by (.+)$/i);
    if (m) author = m[1].trim().replace(/["'’]+$/g, "").trim();
  }
  // Fallback: look at /in/ links, skipping my own profile (first /in/ is usually the reactor).
  if (!author) {
    const inLinks = [...container.querySelectorAll("a[href*='/in/']")];
    for (let i = 1; i < inLinks.length; i++) {
      const text = (inLinks[i].textContent || "").trim();
      if (text && text.length > 1 && !/^\.\.\.$/.test(text) && !/(?:likes?|reposted|commented on)\s+this$/i.test(text) && !/finds? this (?:funny|love|inspire|celebrate)s?$/i.test(text)) {
        author = text;
        break;
      }
    }
  }
  // Company fallback (for company posts)
  if (!author) {
    const companyLinks = [...container.querySelectorAll("a[href*='/company/']")];
    for (const link of companyLinks) {
      const text = (link.textContent || "").trim();
      if (text && !/^\.\.\.$/.test(text)) {
        author = text;
        break;
      }
    }
  }

  // Look for a date-like text in the card (Month + day pattern like "Sep 16").
  // Allow trailing text like " • Edited" or other suffixes - just extract the date part.
  let dateTime = null;
  const dateRe = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(\s*,\s*\d{4})?/;
  const candidates = [...container.querySelectorAll("span, p, div")];
  for (const el of candidates) {
    const t = (el.textContent || "").trim();
    const m = t.match(dateRe);
    if (m) {
      dateTime = m[0].trim();
      break;
    }
  }
  // Fallback: <time> element
  if (!dateTime) {
    const timeEl = container.querySelector("time");
    if (timeEl && timeEl.dateTime) dateTime = timeEl.dateTime;
  }
  return { author, dateTime };
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

// Collect rich metadata for each reaction item (state, author, postHref, dateTime).
function collectReactionItems() {
  const items = [];
  for (const btn of reactionButtons()) {
    const state = reactionState(btn);
    if (state.toLowerCase() === "no reaction") continue;
    const key = reactionKeyForButton(btn);
    if (!key) continue;
    const card = findCard(btn);
    let postHref = null;
    const meta = { author: null, dateTime: null };
    if (card) {
      const feedLink = card.querySelector("a[href*='/feed/update/']");
      if (feedLink) postHref = feedLink.getAttribute("href");
      Object.assign(meta, extractAuthorAndDate(card));
    }
    items.push({ key, state, author: meta.author, postHref, dateTime: meta.dateTime });
  }
  return items;
}

// Collect rich metadata for each comment item (author, postHref, dateTime).
function collectCommentItems() {
  const items = [];
  const seenKeys = new Set();
  for (const btn of commentMenuButtons()) {
    const key = commentKeyForButton(btn);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const card = findCard(btn);
    let postHref = null;
    const meta = { author: null, dateTime: null };
    if (card) {
      const feedLink = card.querySelector("a[href*='/feed/update/']");
      if (feedLink) postHref = feedLink.getAttribute("href");
      Object.assign(meta, extractAuthorAndDate(card));
    }
    items.push({ key, author: meta.author, postHref, dateTime: meta.dateTime });
  }
  return items;
}

// --- Shared ---

function collectKeys() {
  if (isCommentsPage()) return collectCommentKeys();
  if (isReactionsPage()) return collectReactionKeys();
  return [];
}

function collectItems() {
  if (isCommentsPage()) return collectCommentItems();
  if (isReactionsPage()) return collectReactionItems();
  return [];
}

function clickShowMoreIfPresent() {
  const buttons = [...document.querySelectorAll("button")];
  const target = buttons.find((b) => {
    const t = (b.innerText || "").trim().toLowerCase();
    return /load more comments|show more|see more/i.test(t) && b.offsetParent !== null;
  });
  if (target) {
    target.click();
    return true;
  }
  return false;
}

// --- Delete comment flow ---

async function deleteCommentButton(btn) {
  btn.click();
  await sleep(800);

  // find delete option in the opened menu/popover
  let deleteOption = null;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && !deleteOption) {
    const candidates = [...document.querySelectorAll("button, [role='menuitem'], [role='option']")].filter(
      (e) => e.offsetParent !== null && (e.innerText || "").trim().toLowerCase() === "delete"
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
      (b) => b.offsetParent !== null && (b.innerText || "").trim().toLowerCase() === "delete"
    );
    // prefer the one inside a dialog
    const inDialog = candidates.find((b) => b.closest("[role='dialog'], [role='alertdialog']"));
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
    return { ok: false, skip: false, error: "deletion did not complete (possible rate limit)" };
  }
  return { ok: true, key };
}

// --- Delete first eligible ---

async function deleteFirstEligible(skipArr, allowedArr) {
  const skipSet = new Set(skipArr || []);
  // If allowedArr is provided, only keys in this set are eligible. Otherwise all are.
  const allowedSet = allowedArr ? new Set(allowedArr) : null;
  const isAllowed = (k) => !skipSet.has(k) && (!allowedSet || allowedSet.has(k));

  if (isCommentsPage()) {
    const buttons = commentMenuButtons();
    // find first button whose key not skipped (and allowed, if filter set)
    let targetBtn = null;
    let targetKey = null;
    for (const btn of buttons) {
      const k = commentKeyForButton(btn);
      if (k && isAllowed(k)) {
        targetBtn = btn;
        targetKey = k;
        break;
      }
    }
    if (!targetBtn) {
      return { ok: false, key: null, skip: false, error: "no eligible item" };
    }
    const res = await deleteCommentButton(targetBtn);
    return { ...res, key: res.key || targetKey };
  }

  if (isReactionsPage()) {
    const buttons = reactionButtons().filter((b) => reactionState(b).toLowerCase() !== "no reaction");
    let targetBtn = null;
    let targetKey = null;
    for (const btn of buttons) {
      const k = reactionKeyForButton(btn);
      if (k && isAllowed(k)) {
        targetBtn = btn;
        targetKey = k;
        break;
      }
    }
    if (!targetBtn) {
      return { ok: false, key: null, skip: false, error: "no eligible item" };
    }
    // Click to toggle to "no reaction"
    targetBtn.click();
    await sleep(1500);
    // Verify state changed to no reaction
    const newState = reactionState(targetBtn);
    if (newState.toLowerCase() !== "no reaction") {
      // Failed to remove; return metadata about what we tried to delete
      return { 
        ok: false, 
        key: targetKey, 
        skip: false, 
        error: "reaction not removed (possible rate limit)",
        state: newState,
        postHref: null,
        author: null,
        dateTime: null
      };
    }
    // Gather metadata about the deleted item
    // Find post href and author/date info from the container
    let postHref = null;
    let author = null;
    let dateTime = null;
    let state = newState;
    
    // The targetBtn was clicked and is now "no reaction", but we can still extract metadata
    // from the DOM before it changes. Let's find the container and relevant info.
    let container = targetBtn;
    for (let i = 0; i < 30; i++) {
      if (container.querySelector && container.querySelector("a[href*='/feed/update/']")) break;
      container = container.parentElement;
    }
    const feedLink = container.querySelector("a[href*='/feed/update/']");
    if (feedLink) {
      postHref = feedLink.getAttribute("href");
    }
    
    // Get author name
    const authorLinks = [...container.querySelectorAll("a[href*='/in/'], a[href*='/company/']")];
    for (const link of authorLinks) {
      const name = (link.getAttribute("aria-label") || link.textContent || "").trim();
      if (name && !name.includes("...") && name.length > 2) {
        author = name;
        break;
      }
    }
    
    // Get date/time
    const times = [...container.querySelectorAll("time")];
    for (const t of times) {
      dateTime = t.dateTime;
      if (dateTime) break;
    }
    if (!dateTime) {
      const dateElements = [...container.querySelectorAll("[aria-label]")];
      for (const el of dateElements) {
        const al = el.getAttribute("aria-label") || "";
        if (/\b\d{4}\b/.test(al) && /ago|on|\b\d+\b/.test(al)) {
          dateTime = al;
          break;
        }
      }
    }
    
    return { ok: true, key: targetKey, state, author, postHref, dateTime };
  }

  return { ok: false, key: null, skip: false, error: "not on a supported page" };
}

// --- window.LP ---
window.LP = {
  isCommentsPage,
  isReactionsPage,
  collectKeys,
  collectItems,
  deleteFirstEligible,
  clickShowMoreIfPresent,
};