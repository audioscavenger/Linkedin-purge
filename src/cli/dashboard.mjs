/*
  CLI command: start the live dashboard HTTP server.

  Reads dashboardPort from config.json (default 3333) via resolveDashboardPort()
  and starts src/server.mjs as a Node HTTP server on that port.
  Prints the server URL so the user can open it in a browser.

  This is a thin wrapper around src/server.mjs; the actual server lifecycle lives
  there, keeping the CLI minimal and testable.
*/

import { createServer, resolveDashboardPort } from "../server.mjs";

/**
 * Start the dashboard server and keep the process alive.
 * @param {string[]} args - CLI arguments.
 * @returns {Promise<{ server: object, port: number, url: string }>} Server handle.
 */
export async function runDashboard(_args) {
  const port = resolveDashboardPort();
  const { server, url } = await createServer({ port, dataDir: "data" });

  console.log(`Dashboard server started: ${url}`);
  console.log("Endpoints:");
  console.log("  GET  /api/envelope/:type   - scan envelope JSON");
  console.log("  GET  /api/purge/stream     - SSE progress stream");
  console.log("  POST /api/shutdown         - graceful shutdown");

  // Keep the event loop alive while the server holds handles.
  // The server itself keeps the process alive until closed.
  return { server, port, url };
}
