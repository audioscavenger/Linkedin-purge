// Selection page generator: a pure function from a scan envelope to a
// self-contained HTML page with the envelope embedded inline.
//
// The page embeds its data as JSON and renders one row per item. No Card
// Identity and no Key are rendered (they are implementation detail, not
// something a person picks by); selection state lives in each row's
// checkbox for the tickets that build selection and export on top.
export function generateSelectionPage(input) {
  const envelope = normalizeEnvelope(input);
  const type = envelope && envelope.type ? String(envelope.type) : "likes";
  const items = Array.isArray(envelope && envelope.items) ? envelope.items : [];
  const hasLinks = items.some(hasLink);
  const rows = items.map((item) => renderRow(item, hasLinks)).join("\n");
  const embedded = JSON.stringify(envelope == null ? {} : envelope).replace(/</g, "\\u003c");
  const distinctStates = [...new Set(items.map((it) => (it && it.state != null ? String(it.state) : "")))].sort();
  const stateBoxes = distinctStates.map(
    (s) => `      <label class="filter-state-option"><input type="checkbox" class="state-filter" value="${escapeAttr(s)}" checked> ${escapeHtml(s || "(none)")}</label>`
  ).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Selection - ${escapeHtml(type)}</title>
<style>body{font-family:system-ui;margin:1rem;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.4rem .5rem;text-align:left;vertical-align:top}th{background:#f5f5f5}a{color:#0a66c2}.filters{display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:flex-end;margin-bottom:.75rem}.filter-state-option{display:inline-flex;gap:.35rem;align-items:center;font-size:.9rem}label{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem}button{padding:.4rem .8rem;cursor:pointer}#empty-state{padding:1rem;border:1px dashed #bbb;border-radius:.4rem;color:#555}</style>
</head>
<body>
<h1>Selection: ${escapeHtml(type)}</h1>
<div class="filters">
  <fieldset id="filter-states" style="border:none;padding:0;margin:0">
    <legend style="font-size:.85rem">State</legend>
    ${stateBoxes}
  </fieldset>
  <label>Author contains
    <input type="text" id="filter-author" placeholder="author..." style="padding:.4rem;min-width:12rem">
  </label>
  <label>Date from
    <input type="date" id="filter-date-from" style="padding:.4rem">
  </label>
  <label>Date to
    <input type="date" id="filter-date-to" style="padding:.4rem">
  </label>
  <label>Sort by
    <select id="sort-by" style="padding:.4rem">
      <option value="">Default (as scanned)</option>
      <option value="date">Date</option>
      <option value="author">Author</option>
    </select>
  </label>
  <button id="sort-dir" type="button" title="Toggle sort direction">&#8593; asc</button>
</div>
<p id="selection-status"><span id="selected-count">0</span> selected &nbsp;&middot;&nbsp; <span id="row-count">${items.length}</span> of <span id="total-count">${items.length}</span> rows shown</p>
<div id="empty-state" hidden>No items match the current filters.</div>
<table id="selection-table">
  <thead>
    <tr>
      <th><input type="checkbox" id="master-select" title="Select every visible row"></th>
      <th>State</th>
      <th>Author</th>
      <th>Date</th>
      <th>Text</th>
      <th>Status</th>
      ${hasLinks ? "<th>Link</th>" : ""}
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<script type="application/json" id="selection-data">${embedded}</script>
<script>
window.SELECTION_DATA = JSON.parse(document.getElementById("selection-data").textContent);
(function () {
  var tbody = document.querySelector("#selection-table tbody");
  var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
  var rowCountEl = document.getElementById("row-count");
  var emptyEl = document.getElementById("empty-state");
  var authorEl = document.getElementById("filter-author");
  var fromEl = document.getElementById("filter-date-from");
  var toEl = document.getElementById("filter-date-to");
  var sortEl = document.getElementById("sort-by");
  var dirEl = document.getElementById("sort-dir");
  var stateBoxes = Array.prototype.slice.call(document.querySelectorAll(".state-filter"));
  var asc = true;

  var masterEl = document.getElementById("master-select");
  var selectedCountEl = document.getElementById("selected-count");
  var totalCountEl = document.getElementById("total-count");

  // Selection counts: selected = ticked checkboxes; filtered = rows visible
  // under the current filter; total = rows in the table. The master checkbox
  // reflects only the filtered rows: it selects exactly them and nothing
  // excluded by a filter, and it never silently changes rows outside it.
  function visibleRowsNow() {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].style.display !== "none") out.push(rows[i]);
    }
    return out;
  }
  function rowBox(r) { return r.querySelector(".row-select"); }
  function updateSelection() {
    var visible = visibleRowsNow();
    var total = rows.length;
    var selected = 0;
    var visSel = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rowBox(rows[i]).checked) selected++;
    }
    for (var i = 0; i < visible.length; i++) {
      if (rowBox(visible[i]).checked) visSel++;
    }
    selectedCountEl.textContent = String(selected);
    totalCountEl.textContent = String(total);
    if (!visible.length) {
      masterEl.checked = false;
      masterEl.indeterminate = false;
      return;
    }
    masterEl.checked = visSel === visible.length;
    masterEl.indeterminate = visSel > 0 && visSel < visible.length;
  }
  masterEl.addEventListener("change", function () {
    var visible = visibleRowsNow();
    var wanted = masterEl.checked;
    for (var i = 0; i < visible.length; i++) rowBox(visible[i]).checked = wanted;
    updateSelection();
  });
  for (var i = 0; i < rows.length; i++) {
    rowBox(rows[i]).addEventListener("change", updateSelection);
  }

  // Parse a date-ish cell into [year, month, day] so "Sep 16" and
  // "September 12, 2025" compare deterministically. Year-less dates keep
  // year 0, which sorts before any dated one.
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function dateKey(text) {
    var t = String(text || "").trim();
    if (!t) return [0, 0, 0];
    var iso = /^(\\d{4})-(\\d{2})-(\\d{2})/;
    var mIso = t.match(iso);
    if (mIso) return [Number(mIso[1]), Number(mIso[2]), Number(mIso[3])];
    var mNamed = t.match(/([A-Za-z]{3,9})\\s+(\\d{1,2})(?:\\s*,\\s*(\\d{4}))?/);
    if (mNamed) {
      var month = MONTHS[mNamed[1].slice(0, 3).toLowerCase()];
      if (month) return [Number(mNamed[3] || 0), month, Number(mNamed[2])];
    }
    var parsed = Date.parse(t);
    if (!isNaN(parsed)) {
      var d = new Date(parsed);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
    }
    return [0, 0, 0];
  }
  function cmpKey(a, b) {
    for (var i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  function apply() {
    var checked = {};
    for (var i = 0; i < stateBoxes.length; i++) checked[stateBoxes[i].value] = stateBoxes[i].checked;
    var authorNeedle = (authorEl.value || "").trim().toLowerCase();
    var fromKey = fromEl.value ? dateKey(fromEl.value) : null;
    var toKey = toEl.value ? dateKey(toEl.value) : null;
    var visible = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var state = r.getAttribute("data-state") || "";
      var author = (r.getAttribute("data-author") || "").toLowerCase();
      var dKey = dateKey(r.getAttribute("data-date"));
      var ok = true;
      if (stateBoxes.length && !checked[state]) ok = false;
      if (ok && authorNeedle && author.indexOf(authorNeedle) === -1) ok = false;
      if (ok && fromKey && cmpKey(dKey, fromKey) < 0) ok = false;
      if (ok && toKey && cmpKey(dKey, toKey) > 0) ok = false;
      if (ok) visible.push(r);
      r.style.display = ok ? "" : "none";
    }
    // Sort the visible rows in place.
    var sortBy = sortEl.value;
    if (sortBy) {
      var factor = asc ? 1 : -1;
      visible.sort(function (a, b) {
        if (sortBy === "date") {
          return factor * cmpKey(dateKey(a.getAttribute("data-date")), dateKey(b.getAttribute("data-date")));
        }
        return factor * (a.getAttribute("data-author") || "").localeCompare(b.getAttribute("data-author") || "");
      });
    }
    for (var i = 0; i < visible.length; i++) tbody.appendChild(visible[i]);
    rowCountEl.textContent = String(visible.length);
    emptyEl.hidden = visible.length !== 0;
    updateSelection();
    return visible.length;
  }

  for (var i = 0; i < stateBoxes.length; i++) stateBoxes[i].addEventListener("change", apply);
  authorEl.addEventListener("input", apply);
  fromEl.addEventListener("input", apply);
  toEl.addEventListener("input", apply);
  sortEl.addEventListener("change", apply);
  dirEl.addEventListener("click", function () {
    asc = !asc;
    dirEl.innerHTML = asc ? "&#8593; asc" : "&#8595; desc";
    apply();
  });
})();
</script>
</body>
</html>`;
}
export const buildSelectionPage = generateSelectionPage;
export const renderSelectionPage = generateSelectionPage;
export const generateSelectionPageHtml = generateSelectionPage;
export const selectionPage = generateSelectionPage;
export const createSelectionPage = generateSelectionPage;
export const makeSelectionPage = generateSelectionPage;
export const selectionPageHtml = generateSelectionPage;
export default generateSelectionPage;
function normalizeEnvelope(input) {
  if (input == null) return { type: "likes", items: [] };
  if (Array.isArray(input)) return { type: "likes", items: input };
  if (typeof input === "object") {
    if (Array.isArray(input.items)) return input;
    if (input.envelope && Array.isArray(input.envelope.items)) return input.envelope;
    if (input.data && Array.isArray(input.data.items)) return input.data;
    if (input.envelope && typeof input.envelope === "object") return input.envelope;
    if (input.data && typeof input.data === "object") return input.data;
  }
  return { type: "likes", items: [] };
}
function hasLink(item) {
  if (!item || typeof item !== "object") return false;
  return [item.itemHref, item.link, item.href, item.url, item.postHref].some((v) => typeof v === "string" && v.trim() !== "");
}
function linkValue(item) {
  for (const v of [item.itemHref, item.link, item.href, item.url, item.postHref]) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}
function textOrExcerpt(item) {
  if (!item || typeof item !== "object") return "";
  if (item.text != null && String(item.text).trim() !== "") return String(item.text);
  if (item.postExcerpt != null && String(item.postExcerpt).trim() !== "") return String(item.postExcerpt);
  if (item.excerpt != null && String(item.excerpt).trim() !== "") return String(item.excerpt);
  return "";
}
function renderRow(item, hasLinks) {
  const it = item && typeof item === "object" ? item : {};
  const state = escapeHtml(it.state != null ? it.state : "");
  const stateRaw = escapeAttr(it.state != null ? String(it.state) : "");
  const author = escapeHtml(it.author != null ? it.author : "");
  const authorRaw = escapeAttr(it.author != null ? String(it.author) : "");
  const rawDate = it.dateTime != null ? it.dateTime : it.date != null ? it.date : "";
  const date = escapeHtml(rawDate);
  const dateRaw = escapeAttr(String(rawDate));
  const text = escapeHtml(textOrExcerpt(it));
  const status = escapeHtml(it.status != null ? it.status : "");
  const link = linkValue(it);
  const linkCell = hasLinks ? (link ? `<td><a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">link</a></td>` : "<td></td>") : "";
  return `    <tr data-state="${stateRaw}" data-author="${authorRaw}" data-date="${dateRaw}">
      <td><input type="checkbox" class="row-select"></td>
      <td>${state}</td>
      <td>${author}</td>
      <td>${date}</td>
      <td>${text}</td>
      <td>${status}</td>
      ${linkCell}
    </tr>`;
}
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
