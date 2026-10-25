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

// --- Shared ---

function collectKeys() {
  if (isCommentsPage()) return collectCommentKeys();
  if (isReactionsPage()) return collectReactionKeys();
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

async function deleteFirstEligible(skipArr) {
  const skipSet = new Set(skipArr || []);

  if (isCommentsPage()) {
    const buttons = commentMenuButtons();
    // find first button whose key not skipped
    let targetBtn = null;
    let targetKey = null;
    for (const btn of buttons) {
      const k = commentKeyForButton(btn);
      if (k && !skipSet.has(k)) {
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
      if (k && !skipSet.has(k)) {
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
  deleteFirstEligible,
  clickShowMoreIfPresent,
};