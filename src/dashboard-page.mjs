/*
  Dashboard page generator: a self-contained HTML page for the live
  LinkedIn purge dashboard. Served by src/server.mjs at GET /.

  Features:
  - Sidebar tabbed navigation between Comments and Likes (client-side toggle).
  - Rich metadata per item: author, headline, post excerpt, timestamp.
  - "Shutdown App" button in the toolbar that calls /api/shutdown.

  Both tab bodies are pre-rendered from the scan envelopes embedded at
  serve time; the browser script only toggles tabs and handles shutdown,
  so no template literals are nested inside the HTML document string.
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

// Format a date string for display. Falls back to the raw string when the
// value is not parseable (LinkedIn renders e.g. "Sep 16").
function formatDate(dateStr) {
  if (!dateStr) return "--";
  const s = String(dateStr).trim();

  if (!s) return "--";

  const d = new Date(s);

  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString();
  }

  return escapeHtml(s);
}

/**
 * Build one tab body (items table) from a list of envelope items.
 * @param {Array<object>} items - The envelope's items array.
 * @param {boolean} isLikes - True for the Likes tab, false for Comments.
 * @returns {string} HTML fragment for one tab body.
 */
function buildTabContent(items, isLikes) {
  if (!items || items.length === 0) {
    return '<p class="no-items">No items found.</p>';
  }

  const rows = items.map((it) => {
    const author = escapeHtml(it.author || "—");
    const headline = escapeHtml(it.headline || "—");

    const postExcerpt =
      it.postExcerpt !== undefined && it.postExcerpt !== null
        ? escapeHtml(String(it.postExcerpt).substring(0, 200))
        : "—";

    const date = formatDate(it.dateTime);

    return [
      "<tr>",
      '<td><span class="truncate">' + author + "</span></td>",
      '<td><span class="truncate">' + headline + "</span></td>",
      "<td>" + date + "</td>",
      '<td><span class="truncate">' + postExcerpt + "</span></td>",
      "</tr>",
    ].join("\n");
  });

  const type = isLikes ? "likes" : "comments";
  const title = isLikes ? "Likes" : "Comments";

  return [
    '<section class="items-box" id="items-' + type + '">',
    '<h2 class="items-title">' + title + "</h2>",
    '<div class="items-table-wrap">',
    "<table>",
    "<thead>",
    "<tr><th>Author</th><th>Headline</th><th>Date</th><th>Post excerpt</th></tr>",
    "</thead>",
    "<tbody>",
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
 * @param {object|null} envLikes - Likes envelope, may be null.
 * @returns {string} Complete HTML document.
 */
function generateDashboardPage(envComments, envLikes) {
  const commentsItems = (envComments && envComments.items) || [];
  const likesItems = (envLikes && envLikes.items) || [];

  const commentsHtml = buildTabContent(commentsItems, false);
  const likesHtml = buildTabContent(likesItems, true);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LinkedIn Purge — Live Dashboard</title>
  <style>
    :root {
      --bg: #f8f9fa;
      --fg: #212529;
      --muted: #6c757d;
      --accent: #0a66c2;
      --card: #ffffff;
      --border: #dee2e6;
      --success: #107c10;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
    }

    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    header h1 { margin: 0; font-size: 1.1rem; }

    #shutdownBtn {
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    #shutdownBtn:hover { background: #004182; }

    .sidebar {
      display: flex;
      gap: 0.5rem;
      background: var(--card);
      padding: 0.5rem;
      margin: 0 1rem 1rem;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .sidebar button {
      flex: 1;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--fg);
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }
    .sidebar button:hover { background: #e9ecef; }
    .sidebar button.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .content {
      background: var(--card);
      margin: 0 1rem;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      min-height: 300px;
    }
    .items-box { display: none; }
    .items-box.active { display: block; }

    .items-table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td {
      border: 1px solid var(--border);
      padding: 0.4rem 0.5rem;
      font-size: 0.75rem;
      text-align: left;
    }
    th { background: #f0f2f5; position: sticky; top: 0; }
    .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .items-title { margin-top: 0; font-size: 0.9rem; color: var(--muted); }
    .no-items { padding: 2rem; text-align: center; color: var(--muted); }
  </style>
</head>
<body>

<header>
  <h1>LinkedIn Purge — Live Dashboard</h1>
  <button id="shutdownBtn">Shutdown App</button>
</header>

<nav class="sidebar">
  <button class="active" data-type="comments">Comments</button>
  <button data-type="likes">Likes</button>
</nav>

<main class="content" id="mainContent">
  <section class="items-box active" id="items-comments">
    ${commentsHtml}
  </section>
  <section class="items-box" id="items-likes">
    ${likesHtml}
  </section>
</main>

<script>
  // Tab navigation: toggle the active tab button and its section.
  var tabButtons = document.querySelectorAll(".sidebar button");
  var tabSections = document.querySelectorAll(".items-box");

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var type = btn.getAttribute("data-type");

      tabButtons.forEach(function (b) { b.classList.toggle("active", b === btn); });
      tabSections.forEach(function (s) {
        s.classList.toggle("active", s.id === "items-" + type);
      });
    });
  });

  // Shutdown button: gracefully stop the server via the API.
  document.getElementById("shutdownBtn").addEventListener("click", function () {
    fetch("/api/shutdown", { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          document.getElementById("mainContent").innerHTML =
            '<div style="padding:2rem;text-align:center;color:var(--success)">' +
            '<h3>Shutting down...</h3>' +
            '<p>The server is gracefully stopping. Refresh the page later.</p>' +
            "</div>";
        } else {
          alert("Shutdown failed: " + (data.message || "unknown error"));
        }
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
