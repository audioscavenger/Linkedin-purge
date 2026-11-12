/*
  CLI command: start the live dashboard HTTP server and open it in the default browser.

  Reads dashboardPort from config.json (default 3333) via resolveDashboardPort()
  and starts src/server.mjs as a Node HTTP server on that port.
  Automatically opens the dashboard URL in the OS default browser.
*/

import { createServer, resolveDashboardPort } from "../server.mjs";
import { execFile } from "node:child_process";
import { log } from "../logger.mjs";

/**
 * Open a URL in the OS default browser.
 * @param {string} url - URL to open.
 * @returns {Promise<boolean>} Success boolean.
 */
function openUrl(url) {
  const platform = process.platform;
  let file;
  let args;

  if (platform === "darwin") {
    file = "open";
    args = [url];
  } else if (platform === "win32") {
    file = process.env.ComSpec || "cmd.exe";
    // For Windows start command, URLs with ampersands or special chars need empty window title quotes
    args = ["/c", "start", "", url];
  } else {
    file = "xdg-open";
    args = [url];
  }

  return new Promise((resolve) => {
    execFile(file, args, (error) => {
      if (error) {
        log(`Failed to open browser automatically: ${error.message}`);
        resolve(false);
      } else {
        log(`Opened dashboard in browser: ${url}`);
        resolve(true);
      }
    });
  });
}

/**
 * Start the dashboard server, open browser, and keep the process alive.
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

  // Automatically open the dashboard in the default browser
  await openUrl(url);

  return { server, port, url };
}
