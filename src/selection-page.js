// Selection page generator: a pure function from a scan envelope to a
// self-contained HTML page with the envelope embedded inline.
export function generateSelectionPage(input) {
  const envelope = normalizeEnvelope(input);
  const type = envelope && envelope.type ? String(envelope.type) : "likes";
  const items = Array.isArray(envelope && envelope.items) ? envelope.items : [];
  const hasLinks = items.some(hasLink);
  const rows = items.map((item) => renderRow(item, hasLinks)).join("\n");
  const embedded = JSON.stringify(envelope == null ? {} : envelope).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Selection - ${escapeHtml(type)}</title>
<style>body{font-family:system-ui;margin:1rem;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.4rem .5rem;text-align:left;vertical-align:top}th{background:#f5f5f5}a{color:#0a66c2}</style>
</head>
<body>
<h1>Selection: ${escapeHtml(type)}</h1>
<table id="selection-table">
  <thead>
    <tr>
      <th>Select</th>
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
<script>window.SELECTION_DATA = JSON.parse(document.getElementById("selection-data").textContent);</script>
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
  const author = escapeHtml(it.author != null ? it.author : "");
  const date = escapeHtml(it.dateTime != null ? it.dateTime : it.date != null ? it.date : "");
  const text = escapeHtml(textOrExcerpt(it));
  const status = escapeHtml(it.status != null ? it.status : "");
  const link = linkValue(it);
  const linkCell = hasLinks ? (link ? `<td><a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">link</a></td>` : "<td></td>") : "";
  return `    <tr>
      <td><input type="checkbox"></td>
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
