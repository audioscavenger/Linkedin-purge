/*
  Dashboard page generator: a self-contained HTML page for the live
  LinkedIn purge dashboard. Served by src/server.mjs at GET /.

  Features:
  - Single-screen layout: top navbar, toolbar, and bottom activity log are fixed;
    the center main layout and tables scroll vertically.
  - Sidebar tabbed navigation fixed height.
  - Column filter search boxes in the table header for Poster, Headline, Post, and Comment/Reaction.
  - Reaction type selector dynamically listing only scanned reaction types.
  - Post text: expand/collapse toggle option + full post on hover when collapsed.
  - Headline: wrapped without truncation.
  - Dates: unified normalization.
  - Comments: click-to-edit inline section with textarea sized generously.
  - Checkboxes: both sections start UNCHECKED by default.
  - Clean activity log with Cancel Scan button during active scans.
*/

// Escape HTML special characters to prevent injection.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalize dates: keep relative time strings (e.g. "4mo", "2d") or parse dates cleanly.
function formatDate(dateStr) {
  if (!dateStr) return "--";
  const s = String(dateStr).trim();

  if (!s) return "--";

  if (/^\d+\s*(mo|d|yr|w|h|m|s)$/i.test(s) || /^\d+[a-z]+$/i.test(s)) {
    return escapeHtml(s);
  }

  const d = new Date(s);

  if (!isNaN(d.getTime())) {
    const now = new Date();

    const diffMonths =
      (now.getFullYear() - d.getFullYear()) * 12 +
      (now.getMonth() - d.getMonth());

    if (diffMonths >= 1 && diffMonths < 12) {
      return diffMonths + "mo";
    }

    if (diffMonths >= 12) {
      const years = (diffMonths / 12).toFixed(1);

      return years.endsWith(".0")
        ? Math.floor(diffMonths / 12) + "yr"
        : years + "yr";
    }

    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));

    if (diffDays > 0 && diffDays < 30) return diffDays + "d";

    return d.toLocaleDateString();
  }

  return escapeHtml(s);
}

/**
 * Build one tab body (items table) from a list of envelope items.
 * @param {Array<object>} items - The envelope's items array.
 * @param {boolean} isReactions - True for the Reactions tab, false for Comments.
 * @returns {string} HTML fragment for one tab body.
 */
function buildTabContent(items, isReactions) {
  if (!items || items.length === 0) {
    return '<p class="no-items">No items found. Run a scan to populate.</p>';
  }

  const type = isReactions ? "reactions" : "comments";
  const title = isReactions ? "Reactions" : "Comments";

  // Collect unique reaction types present in scanned items if reactions tab
  const uniqueReactionTypes = new Set();

  const rows = items.map((it, idx) => {
    const key = escapeHtml(it.key || `${type}-${idx}`);
    const author = escapeHtml(it.author || "—");
    const headline = escapeHtml(it.headline || "—");

    // Fix: extract post text properly across all possible aliases for both comments and reactions
    const rawPost =
      it.postExcerpt !== undefined && it.postExcerpt !== null
        ? String(it.postExcerpt)
        : it.post ||
          it.postText ||
          it.textSnippet ||
          it.body ||
          it.postTitle ||
          "—";

    const postExcerpt = escapeHtml(rawPost);
    const date = formatDate(it.dateTime || it.date);

    // Glossary Reaction types: Like, Celebrate, Support, Love, Insightful, Funny
    const reactionType = escapeHtml(
      it.reactionType || it.likeType || it.type || "Like"
    );

    uniqueReactionTypes.add(reactionType);

    let textCell = "";

    if (!isReactions) {
      const commentText = escapeHtml(it.text || it.comment || it.body || "");
      textCell = [
        "<td>",
        '<div class="editable-comment-wrap" data-key="' + key + '">',
        '<span class="comment-display-text" title="Click to edit">' +
          (commentText || '<em class="muted">Empty comment</em>') +
          "</span>",
        '<textarea class="comment-edit-input" data-key="' +
          key +
          '" style="display:none;" rows="3">' +
          commentText +
          "</textarea>",
        "</div>",
        "</td>",
      ].join("\n");
    } else {
      const reactionSnippet = escapeHtml(it.text || it.body || "");
      textCell = [
        "<td>",
        '<div class="reaction-info-cell">',
        '<span class="badge-reaction-type">' + reactionType + "</span>",
        reactionSnippet
          ? '<span class="reaction-text-snippet" title="' +
            reactionSnippet +
            '">' +
            reactionSnippet +
            "</span>"
          : "",
        "</div>",
        "</td>",
      ].join("\n");
    }

    return [
      '<tr data-key="' +
        key +
        '" data-author="' +
        author.toLowerCase() +
        '" data-headline="' +
        headline.toLowerCase() +
        '" data-post="' +
        postExcerpt.toLowerCase() +
        '" data-text="' +
        (isReactions
          ? reactionType.toLowerCase() +
            " " +
            (it.text || it.body || "").toLowerCase()
          : escapeHtml(it.text || it.comment || it.body || "").toLowerCase()) +
        '" data-reactiontype="' +
        reactionType.toLowerCase() +
        '">',
      '<td><input type="checkbox" class="row-select" data-key="' +
        key +
        '" /></td>',
      '<td><span class="truncate" title="' +
        author +
        '">' +
        author +
        "</span></td>",
      '<td class="headline-cell"><span class="headline-text">' +
        headline +
        "</span></td>",
      "<td>" + date + "</td>",
      '<td class="post-cell"><div class="post-text-wrap collapsed-post" title="' +
        postExcerpt +
        '">' +
        postExcerpt +
        '<div class="post-full-tooltip">' +
        postExcerpt +
        "</div></div></td>",
      textCell,
      "</tr>",
    ].join("\n");
  });

  const textHeader = isReactions
    ? "<th>Reaction</th>"
    : "<th>Comment (Click to Edit)</th>";

  let reactionTypeOptions =
    '<option value="">All Scanned Types (' +
    uniqueReactionTypes.size +
    ")</option>";

  for (const rt of uniqueReactionTypes) {
    reactionTypeOptions +=
      '<option value="' +
      escapeHtml(rt.toLowerCase()) +
      '">' +
      escapeHtml(rt) +
      "</option>";
  }

  const reactionTypeFilterHtml = isReactions
    ? [
        "<label>Reaction: ",
        '<select id="reactionTypeFilter" class="filter-select">',
        reactionTypeOptions,
        "</select>",
        "</label>",
      ].join("")
    : "";

  return [
    '<section class="items-box" id="items-' + type + '">',
    '<div class="section-header">',
    '<h2 class="items-title">' + title + " (" + items.length + ")</h2>",
    '<div class="selection-controls">',
    reactionTypeFilterHtml,
    '<label><input type="checkbox" id="expandPostsCb"> Expand Posts</label>',
    "</div>",
    "</div>",
    '<div class="items-table-wrap">',
    "<table>",
    "<thead>",
    "<tr>",
    '<th style="width:30px;"><input type="checkbox" class="select-all-cb" data-target="' +
      type +
      '" /></th>',
    "<th>Poster</th><th>Headline</th><th>Date</th><th>Post</th>" + textHeader,
    "</tr>",
    '<tr class="filter-row">',
    "<th></th>",
    '<th><input type="text" class="col-filter" data-col="poster" placeholder="Filter poster..."></th>',
    '<th><input type="text" class="col-filter" data-col="headline" placeholder="Filter headline..."></th>',
    "<th></th>",
    '<th><input type="text" class="col-filter" data-col="post" placeholder="Filter post..."></th>',
    '<th><input type="text" class="col-filter" data-col="text" placeholder="Filter comment/type..."></th>',
    "</tr>",
    "</thead>",
    '<tbody class="filterable-tbody">',
    rows.join("\n"),
    "</tbody>",
    "</table>",
    "</div>",
    "</section>",
  ].join("\n");
}

/**
 * Build the complete dashboard HTML page.
 * @param {object|null} envComments - Comments envelope, may be null.
 * @param {object|null} envReactions - Reactions (likes) envelope, may be null.
 * @returns {string} Complete HTML document.
 */
function generateDashboardPage(envComments, envReactions) {
  const commentsItems = (envComments && envComments.items) || [];
  const reactionsItems = (envReactions && envReactions.items) || [];

  const commentsHtml = buildTabContent(commentsItems, false);
  const reactionsHtml = buildTabContent(reactionsItems, true);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LinkedIn Purge — Live Dashboard</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --fg: #212529;
      --muted: #6c757d;
      --accent: #0a66c2;
      --accent-hover: #004182;
      --card: #ffffff;
      --border: #dee2e6;
      --danger: #d9381e;
      --success: #107c10;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      height: 100vh;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    header h1 { margin: 0; font-size: 1.1rem; color: var(--accent); }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    button, .btn {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 500;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    button:hover, .btn:hover { background: var(--accent-hover); }
    button.secondary { background: #6c757d; }
    button.secondary:hover { background: #5a6268; }
    button.danger { background: var(--danger); }
    button.danger:hover { background: #b52b12; }

    /* Top Action Toolbar */
    .toolbar {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .toolbar-group {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .toolbar label {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .toolbar input[type="number"], .toolbar select, .filter-select {
      padding: 0.25rem 0.4rem;
      font-size: 0.8rem;
      border: 1px solid var(--border);
      border-radius: 4px;
    }
    .toolbar input[type="checkbox"] { cursor: pointer; }

    /* Layout Container: strictly fills remaining height between header/toolbar and activity log */
    .main-layout {
      display: flex;
      flex: 1;
      margin: 0.75rem 1rem;
      gap: 1rem;
      min-height: 0;
      overflow: hidden;
    }

    .sidebar {
      width: 200px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      flex-shrink: 0;
      height: 100%;
    }
    .sidebar button {
      width: 100%;
      text-align: left;
      background: transparent;
      color: var(--fg);
      border: 1px solid transparent;
      padding: 0.5rem 0.7rem;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .sidebar button:hover { background: #e9ecef; }
    .sidebar button.active {
      background: var(--accent);
      color: #fff;
    }

    .content {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      overflow: hidden;
    }

    .items-box { display: none; flex-direction: column; height: 100%; min-height: 0; }
    .items-box.active { display: flex; }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    .items-title { margin: 0; font-size: 0.95rem; color: var(--fg); }
    .selection-controls { display: flex; gap: 1rem; align-items: center; font-size: 0.8rem; color: var(--muted); }

    .items-table-wrap {
      flex: 1;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 4px;
      min-height: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.4rem 0.5rem;
      font-size: 0.75rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f8f9fa; position: sticky; top: 0; z-index: 5; }
    .filter-row th { background: #f1f3f5; padding: 0.2rem 0.3rem; top: 29px; }
    .col-filter {
      width: 100%;
      padding: 0.15rem 0.3rem;
      font-size: 0.7rem;
      border: 1px solid var(--border);
      border-radius: 3px;
    }

    th:nth-child(1), td:nth-child(1) { width: 36px; text-align: center; }
    th:nth-child(2), td:nth-child(2) { width: 18%; }
    th:nth-child(3), td:nth-child(3) { width: 22%; }
    th:nth-child(4), td:nth-child(4) { width: 10%; }
    th:nth-child(5), td:nth-child(5) { width: 26%; }
    th:nth-child(6), td:nth-child(6) { width: 18%; }

    .truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
    
    /* Headline wrap spec: must not be cut */
    .headline-cell { word-break: break-word; white-space: normal; }
    .headline-text { display: block; word-wrap: break-word; }

    /* Post wrap and hover tooltip spec */
    .post-cell { position: relative; }
    .post-text-wrap {
      word-break: break-word;
      white-space: normal;
      max-height: 2.8em;
      overflow: hidden;
    }
    .post-text-wrap.expanded-post {
      max-height: none;
    }
    .post-full-tooltip {
      display: none;
      position: absolute;
      left: 10px;
      top: 100%;
      z-index: 999;
      background: #212529;
      color: #fff;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      white-space: normal;
      word-break: break-word;
    }
    .post-text-wrap.collapsed-post:hover .post-full-tooltip {
      display: block;
    }

    .no-items { padding: 3rem; text-align: center; color: var(--muted); }
    .badge-reaction-type {
      display: inline-block;
      padding: 0.15rem 0.4rem;
      font-size: 0.7rem;
      background: #e9ecef;
      border-radius: 3px;
      color: #495057;
      margin-bottom: 0.2rem;
    }
    .reaction-info-cell { display: flex; flex-direction: column; gap: 0.2rem; }
    .reaction-text-snippet { font-size: 0.7rem; color: var(--muted); word-break: break-word; white-space: normal; }

    /* Click-to-edit comment spec with generous fixed dimensions */
    .comment-display-text {
      display: block;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 3px;
      word-break: break-word;
      white-space: normal;
      min-height: 45px;
    }
    .comment-display-text:hover {
      background: #f1f3f5;
    }
    .comment-edit-input {
      width: 100%;
      min-height: 60px;
      padding: 0.3rem 0.5rem;
      font-size: 0.75rem;
      border: 1px solid var(--danger);
      border-radius: 3px;
      color: var(--danger);
      background: #fff8f8;
      font-family: inherit;
      resize: vertical;
    }

    /* Collapsible Activity Log Drawer */
    .log-drawer {
      background: var(--card);
      border-top: 1px solid var(--border);
      margin: 0 1rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      flex-shrink: 0;
    }
    .log-drawer-header {
      padding: 0.4rem 0.75rem;
      background: #f8f9fa;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      font-weight: 600;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
    }
    .log-content {
      padding: 0.5rem 0.75rem;
      font-family: monospace;
      font-size: 0.7rem;
      background: #1e1e1e;
      color: #d4d4d4;
      max-height: 120px;
      overflow-y: auto;
      border-bottom-left-radius: 6px;
      border-bottom-right-radius: 6px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .log-content.collapsed { display: none; }
  </style>
</head>
<body>

<header>
  <h1>LinkedIn Purge — Live Dashboard Control Center</h1>
  <div class="header-actions">
    <button id="shutdownBtn" class="danger">Shutdown App</button>
  </div>
</header>

<div class="toolbar">
  <div class="toolbar-group">
    <button id="scanCommentsBtn" class="btn">Scan Comments</button>
    <button id="scanReactionsBtn" class="btn">Scan Reactions</button>
    <button id="cancelScanBtn" class="btn secondary" style="display:none;">Cancel Current Scan</button>
    <label><input type="checkbox" id="deepScanCb"> Deep Scan</label>
    <label>Limit: <input type="number" id="limitInput" value="50" min="1" max="1000"></label>
  </div>
  <div class="toolbar-group">
    <button id="pushUpdatesBtn" class="btn" style="background: var(--success);">Push Updates (Delete & Edit)</button>
  </div>
</div>

<div class="main-layout">
  <nav class="sidebar">
    <button class="active" data-type="comments">Comments (<span id="countComments">${commentsItems.length}</span>)</button>
    <button data-type="reactions">Reactions (<span id="countReactions">${reactionsItems.length}</span>)</button>
  </nav>

  <main class="content" id="mainContent">
    <div class="items-box active" id="items-comments">
      ${commentsHtml}
    </div>
    <div class="items-box" id="items-reactions">
      ${reactionsHtml}
    </div>
  </main>
</div>

<div class="log-drawer">
  <div class="log-drawer-header" id="toggleLog">
    <span>Activity Log & SSE Progress Stream</span>
    <span id="logToggleIcon">▼ Collapse</span>
  </div>
  <div class="log-content" id="logConsole">Connecting to SSE stream at /api/purge/stream...\n</div>
</div>

<script>
  var scanActive = false;

  // Append message to log console (suppress heartbeat "purge stream alive" noise)
  function logMessage(msg) {
    if (msg && msg.indexOf("purge stream alive") !== -1) return;
    var consoleEl = document.getElementById("logConsole");
    var ts = new Date().toLocaleTimeString();
    consoleEl.textContent += "[" + ts + "] " + msg + "\\n";
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  // SSE Event Source Connection
  if (window.EventSource) {
    var es = new EventSource("/api/purge/stream");
    es.addEventListener("hello", function(e) {
      try { var data = JSON.parse(e.data); logMessage("Connected: " + data.message); } catch(_){ logMessage("Connected to SSE stream."); }
    });
    es.addEventListener("progress", function(e) {
      try { var data = JSON.parse(e.data); if (data.message && data.message.indexOf("purge stream alive") === -1) { logMessage("Progress: " + data.message); } } catch(_){}
    });
    es.onerror = function() {
      logMessage("SSE connection lost. Reconnecting...");
    };
  }

  // Toggle Log Drawer
  document.getElementById("toggleLog").addEventListener("click", function() {
    var content = document.getElementById("logConsole");
    var icon = document.getElementById("logToggleIcon");
    content.classList.toggle("collapsed");
    icon.textContent = content.classList.contains("collapsed") ? "▲ Expand" : "▼ Collapse";
  });

  // Tab navigation with state restoration so F5/reload keeps active tab
  var tabButtons = document.querySelectorAll(".sidebar button");
  var tabSections = document.querySelectorAll(".items-box");

  function setActiveTab(type) {
    tabButtons.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-type") === type); });
    tabSections.forEach(function (s) { s.classList.toggle("active", s.id === "items-" + type); });
    try { sessionStorage.setItem("activeTab", type); } catch(_) {}
  }

  var savedTab = null;
  try { savedTab = sessionStorage.getItem("activeTab"); } catch(_) {}
  if (savedTab && document.getElementById("items-" + savedTab)) {
    setActiveTab(savedTab);
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setActiveTab(btn.getAttribute("data-type"));
    });
  });

  // Expand Posts toggle option
  document.addEventListener("change", function(e) {
    if (e.target.id === "expandPostsCb") {
      var checked = e.target.checked;
      document.querySelectorAll(".post-text-wrap").forEach(function(el) {
        if (checked) {
          el.classList.add("expanded-post");
          el.classList.remove("collapsed-post");
        } else {
          el.classList.remove("expanded-post");
          el.classList.add("collapsed-post");
        }
      });
    }
  });

  // Click-to-edit comment spec: click text -> show textarea; click outside without modifying -> revert
  document.addEventListener("click", function(e) {
    var displayText = e.target.closest(".comment-display-text");
    if (displayText) {
      var wrap = displayText.closest(".editable-comment-wrap");
      var textarea = wrap.querySelector(".comment-edit-input");
      displayText.style.display = "none";
      textarea.style.display = "block";
      textarea.focus();
      textarea.dataset.originalValue = textarea.value;
      return;
    }

    if (!e.target.closest(".editable-comment-wrap")) {
      document.querySelectorAll(".comment-edit-input").forEach(function(textarea) {
        if (textarea.style.display !== "none") {
          var wrap = textarea.closest(".editable-comment-wrap");
          var displayText = wrap.querySelector(".comment-display-text");
          if (textarea.value === textarea.dataset.originalValue) {
            textarea.style.display = "none";
            displayText.style.display = "block";
          }
        }
      });
    }
  });

  document.addEventListener("blur", function(e) {
    if (e.target.classList.contains("comment-edit-input")) {
      var textarea = e.target;
      var wrap = textarea.closest(".editable-comment-wrap");
      var displayText = wrap.querySelector(".comment-display-text");
      setTimeout(function() {
        if (!wrap.contains(document.activeElement)) {
          if (textarea.value === textarea.dataset.originalValue) {
            textarea.style.display = "none";
            displayText.style.display = "block";
          } else {
            displayText.textContent = textarea.value || "Empty comment";
            textarea.style.display = "none";
            displayText.style.display = "block";
          }
        }
      }, 150);
    }
  }, true);

  // Column filtering and reaction type filtering logic
  function applyFilters(section) {
    var filters = {};
    section.querySelectorAll(".col-filter").forEach(function(input) {
      filters[input.getAttribute("data-col")] = input.value.toLowerCase().trim();
    });

    var reactionTypeFilterEl = section.querySelector("#reactionTypeFilter");
    var reactionTypeVal = reactionTypeFilterEl ? reactionTypeFilterEl.value.toLowerCase().trim() : "";

    var rows = section.querySelectorAll("tbody.filterable-tbody tr");
    rows.forEach(function(row) {
      var author = row.getAttribute("data-author") || "";
      var headline = row.getAttribute("data-headline") || "";
      var post = row.getAttribute("data-post") || "";
      var text = row.getAttribute("data-text") || "";
      var reactiontype = row.getAttribute("data-reactiontype") || "";

      var match = true;
      if (filters.poster && author.indexOf(filters.poster) === -1) match = false;
      if (filters.headline && headline.indexOf(filters.headline) === -1) match = false;
      if (filters.post && post.indexOf(filters.post) === -1) match = false;
      if (filters.text && text.indexOf(filters.text) === -1) match = false;

      if (reactionTypeVal && reactiontype !== reactionTypeVal) {
        match = false;
      }

      row.style.display = match ? "" : "none";
    });
  }

  document.querySelectorAll(".items-box").forEach(function(section) {
    section.querySelectorAll(".col-filter").forEach(function(input) {
      input.addEventListener("input", function() { applyFilters(section); });
    });
    var reactionTypeSel = section.querySelector("#reactionTypeFilter");
    if (reactionTypeSel) {
      reactionTypeSel.addEventListener("change", function() { applyFilters(section); });
    }
  });

  // Select-all checkbox respects current active filters
  document.addEventListener("change", function(e) {
    if (e.target.classList.contains("select-all-cb")) {
      var targetType = e.target.getAttribute("data-target");
      var container = document.getElementById("items-" + targetType);
      var checked = e.target.checked;
      container.querySelectorAll("tbody.filterable-tbody tr").forEach(function(row) {
        if (row.style.display !== "none") {
          var cb = row.querySelector(".row-select");
          if (cb) cb.checked = checked;
        }
      });
      logMessage((checked ? "Selected" : "Deselected") + " visible filtered " + targetType);
    }
  });

  // Scan triggers (no temporary browser window opening)
  function triggerScan(type) {
    if (scanActive) return;
    scanActive = true;
    document.getElementById("cancelScanBtn").style.display = "inline-block";
    var deep = document.getElementById("deepScanCb").checked;
    var limit = document.getElementById("limitInput").value;
    logMessage("Starting scan for " + type + " (deep: " + deep + ", limit: " + limit + ")...");
    
    fetch("/api/scan/" + type, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deep: deep, limit: parseInt(limit, 10) || 50 })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      scanActive = false;
      document.getElementById("cancelScanBtn").style.display = "none";
      if (data.ok) {
        logMessage("Scan completed for " + type + ". Refreshing dashboard data...");
        // Fetch updated envelope via API and refresh table dynamically without full reload
        fetch("/api/envelope/" + type)
          .then(function(r) { return r.json(); })
          .then(function(env) {
            logMessage("Loaded updated envelope for " + type + " (" + (env.items ? env.items.length : 0) + " items). Reloading page to render.");
            window.location.reload();
          })
          .catch(function() {
            window.location.reload();
          });
      } else {
        logMessage("Scan failed: " + (data.error || "unknown error"));
        alert("Scan failed: " + (data.error || "unknown error"));
      }
    })
    .catch(function(err) {
      scanActive = false;
      document.getElementById("cancelScanBtn").style.display = "none";
      logMessage("Scan request error: " + err.message);
      alert("Scan request failed.");
    });
  }

  document.getElementById("scanCommentsBtn").addEventListener("click", function() { triggerScan("comments"); });
  document.getElementById("scanReactionsBtn").addEventListener("click", function() { triggerScan("reactions"); });

  document.getElementById("cancelScanBtn").addEventListener("click", function() {
    fetch("/api/scan/cancel", { method: "POST" })
      .then(function() {
        scanActive = false;
        document.getElementById("cancelScanBtn").style.display = "none";
        logMessage("Scan cancellation requested.");
      });
  });

  // Push Updates (Batch Deletions & Comment Edits)
  document.getElementById("pushUpdatesBtn").addEventListener("click", function() {
    var deletions = [];
    document.querySelectorAll(".row-select:checked").forEach(function(cb) {
      deletions.push(cb.getAttribute("data-key"));
    });

    var commentEdits = {};
    document.querySelectorAll(".comment-edit-input").forEach(function(textarea) {
      var key = textarea.getAttribute("data-key");
      var text = textarea.value;
      commentEdits[key] = text;
    });

    logMessage("Pushing updates: " + deletions.length + " items selected for deletion, " + Object.keys(commentEdits).length + " comment edits staged.");

    fetch("/api/purge/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletions: deletions, commentEdits: commentEdits })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.ok) {
        logMessage("Push updates completed successfully!");
        alert("Updates pushed successfully!");
        setTimeout(function() { window.location.reload(); }, 1000);
      } else {
        logMessage("Push updates failed: " + (data.error || "unknown error"));
        alert("Push failed: " + (data.error || "unknown error"));
      }
    })
    .catch(function(err) {
      logMessage("Push request error: " + err.message);
      alert("Push request failed.");
    });
  });

  // Shutdown button (no confirm popup, direct termination)
  document.getElementById("shutdownBtn").addEventListener("click", function () {
    logMessage("Sending shutdown request...");
    fetch("/api/shutdown", { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function () {
        logMessage("Server shut down successfully.");
        document.body.innerHTML =
          '<div style="padding:4rem;text-align:center;color:var(--success)">' +
          '<h2>Application Shut Down</h2>' +
          '<p>The local dashboard server has stopped and the process terminated. You may close this tab.</p>' +
          "</div>";
      })
      .catch(function () {
        alert("Shutdown request failed.");
      });
  });
</script>

</body>
</html>`;
}

export { generateDashboardPage };

export default generateDashboardPage;
