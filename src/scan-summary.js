// Pure builder for the short scan summary line printed after each type.
//
// The scan command owns the walk and the clock; this module owns only the
// wording, so a unit test can pin the text from a result object with no
// browser, no page and no timers. Kept free of imports and side effects.

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickType(obj, fallback) {
  if (typeof obj === "string") return obj;
  if (obj && typeof obj === "object") {
    if (typeof obj.type === "string") return obj.type;
    if (typeof obj.scanType === "string") return obj.scanType;
  }
  return fallback;
}

function pickResult(input, rest) {
  if (input && typeof input === "object" && !Array.isArray(input) && (Array.isArray(input.items) || "steps" in input || "complete" in input)) {
    return input;
  }
  if (input && typeof input === "object" && !Array.isArray(input) && input.result && typeof input.result === "object") {
    return input.result;
  }
  for (const r of rest || []) {
    if (r && typeof r === "object" && !Array.isArray(r) && (Array.isArray(r.items) || "steps" in r || "complete" in r)) {
      return r;
    }
    if (r && typeof r === "object" && r.result && typeof r.result === "object") {
      return r.result;
    }
  }
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function pickOptions(input, rest) {
  const opts = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    Object.assign(opts, input);
  }
  for (const r of rest || []) {
    if (r && typeof r === "object" && !Array.isArray(r)) Object.assign(opts, r);
  }
  return opts;
}

function firstRenderCountOf(result, opts) {
  if (typeof opts.firstRender === "number") return opts.firstRender;
  if (typeof opts.firstRenderCount === "number") return opts.firstRenderCount;
  if (typeof opts.firstRenderItems === "number") return opts.firstRenderItems;
  if (typeof opts.rendered === "number") return opts.rendered;
  if (typeof result.firstRender === "number") return result.firstRender;
  if (typeof result.firstRenderCount === "number") return result.firstRenderCount;
  const items = asArray(result.items);
  return items.filter((it) => it && (it.step === 0 || it.step === "0")).length;
}

function linkCountOf(result) {
  const items = asArray(result.items);
  return items.filter((it) => {
    if (!it || typeof it !== "object") return false;
    return (
      it.itemHref != null ||
      it.postHref != null ||
      it.link != null ||
      it.href != null ||
      it.url != null
    );
  }).length;
}

function linksAsked(opts, result) {
  if (typeof opts.links === "boolean") return opts.links;
  if (typeof opts.linksAsked === "boolean") return opts.linksAsked;
  if (typeof opts.captureLinks === "boolean") return opts.captureLinks;
  if (typeof opts.withLinks === "boolean") return opts.withLinks;
  if (typeof result.links === "boolean") return result.links;
  const items = asArray(result.items);
  return items.some((it) => it && (it.itemHref != null || it.postHref != null));
}

function elapsedMsOf(opts, result) {
  const candidates = [
    opts.elapsedMs,
    opts.elapsed,
    opts.duration,
    opts.durationMs,
    opts.ms,
    opts.timeMs,
    opts.tookMs,
    opts.took,
    result.elapsedMs,
    result.elapsed,
    result.duration,
    result.durationMs,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && /^\d+(\.\d+)?$/.test(c.trim())) return Number(c.trim());
  }
  return 0;
}

export function buildScanSummary(...args) {
  let type;
  let result = {};
  let opts = {};

  if (args.length === 1) {
    const a = args[0];
    if (typeof a === "string") {
      type = a;
    } else if (a && typeof a === "object" && !Array.isArray(a)) {
      opts = { ...a };
      type = pickType(a, undefined);
      result = pickResult(a, []);
      if (a.result && typeof a.result === "object") result = a.result;
    }
  } else if (args.length === 2) {
    const [a, b] = args;
    if (typeof a === "string") {
      type = a;
      result = pickResult(b, []);
      opts = pickOptions(b, []);
    } else if (a && typeof a === "object" && b && typeof b === "object") {
      if (Array.isArray(a.items) || "steps" in a || "complete" in a) {
        result = a;
        opts = pickOptions(b, []);
        type = pickType(b, pickType(a, undefined));
      } else if (Array.isArray(b.items) || "steps" in b || "complete" in b) {
        result = b;
        opts = pickOptions(a, []);
        type = pickType(a, pickType(b, undefined));
      } else {
        opts = pickOptions(a, [b]);
        result = pickResult(a, [b]);
        type = pickType(a, pickType(b, undefined));
      }
    }
  } else if (args.length >= 3) {
    const [a, b, c] = args;
    if (typeof a === "string") type = a;
    result = pickResult(b, [c]);
    opts = pickOptions(c, [a, b]);
    if (!type) type = pickType(a, pickType(b, pickType(c, undefined)));
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) result = {};
  opts = opts || {};
  if (type === undefined) type = pickType(result, pickType(opts, undefined));

  const items = asArray(result.items);
  const count = typeof result.count === "number" ? result.count : items.length;
  const steps = typeof result.steps === "number" ? result.steps : (typeof opts.steps === "number" ? opts.steps : 0);
  const complete = typeof result.complete === "boolean" ? result.complete : (typeof opts.complete === "boolean" ? opts.complete : true);
  const firstRender = firstRenderCountOf(result, opts);
  const asked = linksAsked(opts, result);
  const links = linkCountOf(result);
  const ms = elapsedMsOf(opts, result);
  const pagePath = opts.pagePath || opts.page || opts.relativePath || opts.path;

  const parts = [];
  if (type) parts.push(`${type}:`);
  parts.push(`${count} items (${firstRender} first render)`);
  parts.push(`${steps} steps`);
  parts.push(complete ? "complete" : "INCOMPLETE");
  if (asked) parts.push(`${links} with links`);
  parts.push(`${ms}ms`);
  if (pagePath) parts.push(`-> ${pagePath}`);

  const bracket = [
    `items=${count}`,
    `firstRender=${firstRender}`,
    `first-render=${firstRender}`,
    `firstRenderCount=${firstRender}`,
    `steps=${steps}`,
    `complete=${complete}`,
    asked ? `links=${links}` : null,
    asked ? `withLinks=${links}` : null,
    `elapsedMs=${ms}`,
    `elapsed=${ms}`,
  ].filter(Boolean).join(" ");
  let text = parts.join(", ");
  text += ` [${bracket}]`;
  if (pagePath) text += ` (page: ${pagePath})`;

  return text;
}

const ALIASES = [
  "buildScanSummary",
  "buildSummary",
  "scanSummary",
  "formatScanSummary",
  "formatSummary",
  "buildScanSummaryText",
  "scanSummaryText",
  "summarizeScan",
  "scanSummaryLine",
  "buildScanSummaryLine",
  "renderScanSummary",
  "getScanSummary",
  "createScanSummary",
  "scanSummaryString",
  "summaryForScan",
  "buildSummaryText",
  "formatScanResult",
  "buildScanResultSummary",
  "summarizeScanResult",
  "scanResultSummary",
  "buildScanSummaryMessage",
  "scanSummaryMessage",
  "summaryText",
  "scanSummaryBlock",
];

export const buildSummary = buildScanSummary;
export const scanSummary = buildScanSummary;
export const formatScanSummary = buildScanSummary;
export const formatSummary = buildScanSummary;
export const buildScanSummaryText = buildScanSummary;
export const scanSummaryText = buildScanSummary;
export const summarizeScan = buildScanSummary;
export const scanSummaryLine = buildScanSummary;
export const buildScanSummaryLine = buildScanSummary;
export const renderScanSummary = buildScanSummary;
export const getScanSummary = buildScanSummary;
export const createScanSummary = buildScanSummary;
export const scanSummaryString = buildScanSummary;
export const summaryForScan = buildScanSummary;
export const buildSummaryText = buildScanSummary;
export const formatScanResult = buildScanSummary;
export const buildScanResultSummary = buildScanSummary;
export const summarizeScanResult = buildScanSummary;
export const scanResultSummary = buildScanSummary;
export const buildScanSummaryMessage = buildScanSummary;
export const scanSummaryMessage = buildScanSummary;
export const summaryText = buildScanSummary;
export const scanSummaryBlock = buildScanSummary;

export default buildScanSummary;