/*
  Pure builder for the short scan summary line printed after each type.

  The scan command owns the walk and the clock; this module owns only the
  wording, so a unit test can pin the text from a result object with no
  browser, no page and no timers. Kept free of imports and side effects.
*/

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstRenderCountOf(result) {
  const items = asArray(result.items);

  return items.filter((it) => it && (it.step === 0 || it.step === "0")).length;
}

function linkCountOf(result) {
  const items = asArray(result.items);

  return items.filter((it) => {
    if (!it || (it.constructor !== Object && it.constructor !== Array))
      return false;

    return (
      it.itemHref != null ||
      it.postHref != null ||
      it.link != null ||
      it.href != null ||
      it.url != null
    );
  }).length;
}

function linksAsked(links, result) {
  if (links === true || links === false) return links;
  const items = asArray(result.items);

  return items.some((it) => it && (it.itemHref != null || it.postHref != null));
}

function elapsedMsOf(elapsedMs) {
  if (elapsedMs?.constructor === Number && Number.isFinite(elapsedMs))
    return elapsedMs;

  if (
    elapsedMs?.constructor === String &&
    /^\d+(\.\d+)?$/.test(elapsedMs.trim())
  )
    return Number(elapsedMs.trim());

  return 0;
}

export function buildScanSummary({
  type,
  result = {},
  links,
  elapsedMs = 0,
  pagePath,
} = {}) {
  const r =
    result && result.constructor === Object && !Array.isArray(result)
      ? result
      : {};

  const items = asArray(r.items);
  const count = r.count?.constructor === Number ? r.count : items.length;
  const steps = r.steps?.constructor === Number ? r.steps : 0;
  const complete = r.complete?.constructor === Boolean ? r.complete : true;
  const firstRender = firstRenderCountOf(r);
  const asked = linksAsked(links, r);
  const linkCount = linkCountOf(r);
  const ms = elapsedMsOf(elapsedMs);

  const parts = [];

  if (type) parts.push(`${type}:`);
  parts.push(`${count} items (${firstRender} first render)`);
  parts.push(`${steps} steps`);
  parts.push(complete ? "complete" : "INCOMPLETE");

  if (asked) parts.push(`${linkCount} with links`);
  parts.push(`${ms}ms`);

  if (pagePath) parts.push(`-> ${pagePath}`);

  const bracket = [
    `items=${count}`,
    `firstRender=${firstRender}`,
    `first-render=${firstRender}`,
    `firstRenderCount=${firstRender}`,
    `steps=${steps}`,
    `complete=${complete}`,
    asked ? `links=${linkCount}` : null,
    asked ? `withLinks=${linkCount}` : null,
    `elapsedMs=${ms}`,
    `elapsed=${ms}`,
  ]
    .filter(Boolean)
    .join(" ");

  let text = parts.join(", ");
  text += ` [${bracket}]`;

  if (pagePath) text += ` (page: ${pagePath})`;

  return text;
}
