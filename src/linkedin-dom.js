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

function reactionKeyForIndex(idx) {
  return idx >= 0 ? `reaction:${idx}` : null;
}

function reactionKeyForButton(btn) {
  // The card keeps its place among the reaction buttons for the life of the
  // page session: an unliked card stays put with state "no reaction" until the
  // page is reloaded, and then it disappears. The index is therefore a
  // session-scoped key, not one that survives a reload (permalinks are not
  // reachable per item in this UI).
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

// Extract post author + date from the reaction/comment card's container.
// This is the single canonical card-metadata extractor: the scan path and both
// delete flows all call it on the card, so every record for the same item
// carries the same author and dateTime.
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

// The one card-metadata reader: resolve the pristine card, pick up its post
// link, then hand the card to extractAuthorAndDate (still the sole
// author/date extractor). Returns { postHref, author, dateTime } with null
// fallbacks when the card or its pieces are absent. The scan path and both
// delete flows read through here, so every record for the same card comes
// from one place.
function readCardMeta(btn) {
  const meta = { postHref: null, author: null, dateTime: null };
  const card = findCard(btn);
  if (card) {
    const feedLink = card.querySelector("a[href*='/feed/update/']");
    if (feedLink) meta.postHref = feedLink.getAttribute("href");
    Object.assign(meta, extractAuthorAndDate(card));
  }
  return meta;
}

// Collect rich metadata for each reaction item (state, author, postHref, dateTime).
// Keys already seen are skipped before metadata extraction, so a deep walk reads
// each card once instead of re-reading the whole list on every load step.
function collectReactionItems(seenKeys) {
  const seen = new Set(seenKeys || []);
  const items = [];
  reactionButtons().forEach((btn, idx) => {
    const state = reactionState(btn);
    if (state.toLowerCase() === "no reaction") return;
    const key = reactionKeyForIndex(idx);
    if (!key || seen.has(key)) return;
    const meta = readCardMeta(btn);
    items.push({ key, state, author: meta.author, postHref: meta.postHref, dateTime: meta.dateTime });
  });
  return items;
}

// Collect rich metadata for each comment item (author, postHref, dateTime).
// Same incremental contract as reactions: keys already seen are skipped before
// metadata extraction.
function collectCommentItems(seenKeys) {
  const items = [];
  const seen = new Set(seenKeys || []);
  for (const btn of commentMenuButtons()) {
    const key = commentKeyForButton(btn);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const meta = readCardMeta(btn);
    items.push({ key, author: meta.author, postHref: meta.postHref, dateTime: meta.dateTime });
  }
  return items;
}

// --- Shared ---

function collectKeys() {
  if (isCommentsPage()) return collectCommentKeys();
  if (isReactionsPage()) return collectReactionKeys();
  return [];
}

function collectItems(seenKeys) {
  if (isCommentsPage()) return collectCommentItems(seenKeys);
  if (isReactionsPage()) return collectReactionItems(seenKeys);
  return [];
}

// --- Activity List traversal helpers ---

// The Activity List's cards. Both tabs render them as role="listitem" and
// neither virtualizes: cards accumulate as more of the list loads.
function activityCards() {
  return [...document.querySelectorAll('[role="listitem"]')];
}

// The element that actually scrolls the Activity List: the nearest scrollable
// ancestor of a card, then the element with id "workspace", then the main
// landmark, then the document scroller. Measured today, all of them land on
// #workspace, but the derivation order is what survives a rename.
function activityScrollTarget() {
  let node = activityCards()[0] || null;
  for (let i = 0; i < 20 && node; i++) {
    const cs = getComputedStyle(node);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 40) {
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

// The key of one card, computed without reading its metadata: the comment's
// replaceableComment_ id, or the reaction button's session-scoped position.
function cardKey(card) {
  if (isCommentsPage()) {
    const comment = card.querySelector("[id^='replaceableComment_']");
    return comment ? comment.id : null;
  }
  if (isReactionsPage()) {
    const btn = [...card.querySelectorAll("button")].find((b) =>
      /^Reaction button state:/i.test(b.getAttribute("aria-label") || "")
    );
    return btn ? reactionKeyForButton(btn) : null;
  }
  return null;
}

// Cheap growth signal: the Activity List's scroll height, its card count and
// the last card's key. Never extracts card metadata, so polling it while the
// list grows to hundreds of cards stays cheap. Growth of any of the three means
// the page loaded more content.
function readGrowthSignal() {
  const cards = activityCards();
  const target = activityScrollTarget();
  const last = cards.length ? cards[cards.length - 1] : null;
  return {
    scrollHeight: target ? target.scrollHeight : 0,
    count: cards.length,
    lastKey: last ? cardKey(last) : null,
  };
}

// --- Delete comment flow ---

// Comments have no per-item state (unlike reactions there is no stateful
// button on the card), so a deleted comment records the activity itself as its
// state. A stable constant keeps comment results the same shape as reaction
// results, where state is always a real, non-null value.
const COMMENTS_STATE = "Commented";

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

async function deleteFirstEligible(eligibleKeys) {
  // Plain membership test only: the runner owns the eligibility rule
  // (checkpoint-processed excluded, input-set filter) and hands us its
  // precomputed list. We simply take the first visible item whose key is in it.
  // Contract: the runner always passes an array - no null-guards here.
  const eligibleSet = new Set(eligibleKeys);
  const isEligible = (k) => eligibleSet.has(k);

  if (isCommentsPage()) {
    const buttons = commentMenuButtons();
    // find first button whose key is in the eligible list passed in
    let targetBtn = null;
    let targetKey = null;
    for (const btn of buttons) {
      const k = commentKeyForButton(btn);
      if (k && isEligible(k)) {
        targetBtn = btn;
        targetKey = k;
        break;
      }
    }
    if (!targetBtn) {
      return { ok: false, key: null, skip: false, error: "no eligible item" };
    }
    // Record card metadata from the pristine card BEFORE the destructive
    // menu -> delete -> confirm sequence: once the comment is gone, the card is
    // gone too. readCardMeta reads through the canonical extractor (the same
    // one the scan path uses), which takes the post author from the "Open
    // control menu for post by" label first, skipping the commenter's own
    // profile link, with ordered fallbacks, then the date text and the <time>
    // element. ("author" is the post author, never the account being purged.)
    const meta = readCardMeta(targetBtn);
    const res = await deleteCommentButton(targetBtn);
    // Same result shape as reaction deletions on every path (success and
    // failure alike): ok, key, skip, state, author, postHref, dateTime.
    return { ...res, key: res.key || targetKey, state: COMMENTS_STATE, author: meta.author, postHref: meta.postHref, dateTime: meta.dateTime };
  }

  if (isReactionsPage()) {
    const buttons = reactionButtons().filter((b) => reactionState(b).toLowerCase() !== "no reaction");
    let targetBtn = null;
    let targetKey = null;
    for (const btn of buttons) {
      const k = reactionKeyForButton(btn);
      if (k && isEligible(k)) {
        targetBtn = btn;
        targetKey = k;
        break;
      }
    }
    if (!targetBtn) {
      return { ok: false, key: null, skip: false, error: "no eligible item" };
    }
    // Record card metadata from the pristine card BEFORE the destructive
    // toggle click: readCardMeta reads through the canonical extractor (the
    // same one the scan path uses), which takes the post author from the
    // "Open control menu for post by" label first, skipping the reactor's own
    // profile link, with ordered fallbacks, then the date text and the <time>
    // element. ("author" is the post author, never the account being purged.)
    // The old post-click walk that took the first /in/ or /company/ link could
    // record the purged account's own name; extraction now happens before the
    // click and never after.
    const meta = readCardMeta(targetBtn);
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
        author: meta.author,
        postHref: meta.postHref,
        dateTime: meta.dateTime
      };
    }
    return { ok: true, key: targetKey, state: newState, author: meta.author, postHref: meta.postHref, dateTime: meta.dateTime };
  }

  return { ok: false, key: null, skip: false, error: "not on a supported page" };
}

// --- window.LP ---
window.LP = {
  isCommentsPage,
  isReactionsPage,
  collectKeys,
  collectItems,
  readGrowthSignal,
  scrollActivityListToBottom,
  deleteFirstEligible,
};
