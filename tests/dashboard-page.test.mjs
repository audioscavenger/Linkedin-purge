// Tests for the dashboard page's column widths. The page is generated from
// scan envelopes, so the test asserts the generated CSS rules rather than a
// rendered table: the browser is the only consumer of these widths.
import assert from "node:assert";
import { generateDashboardPage } from "../src/dashboard-page.mjs";

const html = generateDashboardPage(
  {
    items: [{ key: "c1", text: "hello", author: "Ada", dateTime: "2mo" }],
  },
  {
    items: [{ key: "r1", state: "Like", author: "Bo", dateTime: "2mo" }],
  }
);

// 1. Checkbox column is the 13px checkbox plus its 8px margin on each side.
assert.ok(
  html.includes("width: calc(13px + 1rem)"),
  "Checkbox column should be the checkbox plus its margin"
);

// 2. Date column is 3%.
assert.ok(
  html.includes("th:nth-child(4), td:nth-child(4) { width: 3%; }"),
  "Date column should be 3%"
);

// 3. Reaction column is the 22px icon plus its 8px padding, scoped to the
//    Reactions tab so the Comments tab keeps its wide editor column.
assert.ok(
  html.includes("width: calc(22px + 1rem)"),
  "Reaction column should be 22px plus padding"
);

assert.ok(
  html.includes(
    "#items-reactions th:nth-child(6), #items-reactions td:nth-child(6)"
  ),
  "Reaction column width should be scoped to the Reactions tab"
);

// 4. The shutdown handler closes the EventSource so the browser stops
//    retrying the dead port. Without this the tab keeps opening sockets and
//    netstat shows SYN_SENT rows for the exited server.
assert.ok(
  html.includes("es.close()"),
  "Shutdown handler should close the EventSource"
);

assert.ok(
  html.includes("shuttingDown"),
  "Shutdown handler should suppress the reconnect log"
);

console.log("dashboard-page.test.js passed successfully!");
