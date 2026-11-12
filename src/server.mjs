/*
  Server module: Node HTTP server for the live dashboard API.

  Reads `dashboardPort` from config.json (defaulting to 3333 if unset) and
  serves a live dashboard HTML page plus three REST endpoints:

    GET  /                      - live dashboard HTML page
    GET  /api/envelope/:type    - scan envelope JSON for comments/likes
    GET  /api/purge/stream      - SSE progress stream (purge/update feedback)
    POST /api/shutdown          - gracefully stop the server process

  JSDoc + OpenAPI 3.1:
    Each exported function carries a JSDoc block with an `@openapi 3.1`
    section describing the endpoint contract (path, method, params, responses).

  Module interaction graph:
    src/server.mjs
      ├── imports logger.mjs            (timestamps for progress events)
      ├── imports dashboard-page.mjs      (dashboard HTML page generation)
      ├── imports fs, path              (config.json + scan-envelope files)
      └── exports createServer(), stopServer()

  createServer({ port, dataDir } = {}) binds and listens on the resolved port.
  stopServer(server) closes the listener and exits the process.
*/

import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.mjs";
import { generateDashboardPage } from "./dashboard-page.mjs";

const DEFAULT_PORT = 3333;
const KNOWN_TYPES = new Set(["comments", "likes", "reactions"]);
const EVENT_STREAM_INTERVAL_MS = 2000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Read dashboardPort from config.json, defaulting to 3333 when unset, when the
 * file is missing, or when it is unparseable.
 * @returns {number} The dashboard port number.
 */
export function resolveDashboardPort() {
  const configPath = path.resolve(process.cwd(), "config.json");

  if (!fs.existsSync(configPath)) {
    return DEFAULT_PORT;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (
      config &&
      config.constructor === Object &&
      Number.isInteger(config.dashboardPort) &&
      config.dashboardPort > 0
    ) {
      return config.dashboardPort;
    }
  } catch {
    // Fall through to the built-in default.
  }

  return DEFAULT_PORT;
}

/**
 * Build the SSE frame text for one event.
 * @param {string} type - Event type label (hello, progress, shutdown).
 * @param {object} data - Event payload.
 * @returns {string} Formatted SSE frame text.
 */
function sseFrame(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Load one scan envelope from data/scan-<type>.json.
 * @param {string} dataDir - Directory holding the scan envelopes.
 * @param {string} type - "comments" or "likes".
 * @returns {{ envelope: object|null, error: string|null }} Envelope or error.
 */
function loadEnvelope(dataDir, type) {
  const file = path.join(path.resolve(dataDir), `scan-${type}.json`);
  let raw;

  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { envelope: null, error: `No scan envelope for type "${type}"` };
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    return {
      envelope: null,
      error: `Invalid JSON in scan envelope for type "${type}"`,
    };
  }

  return { envelope: data, error: null };
}

/**
 * Send a JSON response.
 * @param {http.ServerResponse} res - Response object.
 * @param {number} status - HTTP status code.
 * @param {object} body - JSON-serializable body.
 * @returns {void}
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);

  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });

  res.end(payload);
}

/**
 * Build the request-handler closure used by the dashboard HTTP server.
 * Owns the SSE client set for the purge progress stream.
 * @param {string} dataDir - Directory holding the scan envelopes.
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void} Handler.
 */
function createRequestHandler(dataDir) {
  const sseClients = new Set();

  function broadcast(type, data) {
    const frame = sseFrame(type, data);

    for (const client of sseClients) {
      try {
        client.write(frame);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function dropClient(res) {
    sseClients.delete(res);

    try {
      res.end();
    } catch {
      // Ignore already-closed responses.
    }
  }

  return async function handleRequest(req, res) {
    const { pathname } = new URL(req.url || "/", "http://localhost");

    // --- GET /api/envelope/:type: serve the scan envelope for one type.
    if (req.method === "GET" && /^\/api\/envelope\/([^/]+)$/.test(pathname)) {
      const type = pathname.split("/").pop();

      if (!KNOWN_TYPES.has(type)) {
        return sendJson(res, 400, {
          error: `Unknown type "${type}". Expected one of: ${[...KNOWN_TYPES].join(", ")}.`,
        });
      }

      const { envelope, error } = loadEnvelope(dataDir, type);

      if (error) {
        return sendJson(res, 404, { error, type });
      }

      return sendJson(res, 200, envelope);
    }

    // --- GET /api/purge/stream: SSE progress stream.
    if (req.method === "GET" && pathname === "/api/purge/stream") {
      res.writeHead(200, SSE_HEADERS);
      res.write(
        sseFrame("hello", {
          ts: new Date().toISOString(),
          message: "SSE stream connected",
        })
      );
      sseClients.add(res);
      res.on("close", () => dropClient(res));
      res.on("aborted", () => dropClient(res));
      res.on("error", () => dropClient(res));

      const timer = setInterval(() => {
        broadcast("progress", {
          ts: new Date().toISOString(),
          message: "purge stream alive",
          clients: sseClients.size,
        });
      }, EVENT_STREAM_INTERVAL_MS);

      res.on("close", () => clearInterval(timer));
      res.on("error", () => clearInterval(timer));

      return;
    }

    // --- POST /api/scan/:type: trigger scan via CLI wrapper logic or headless scan runner.
    if (req.method === "POST" && /^\/api\/scan\/([^/]+)$/.test(pathname)) {
      let type = pathname.split("/").pop();

      if (type === "reactions") type = "likes";

      if (!KNOWN_TYPES.has(type)) {
        return sendJson(res, 400, {
          error: `Unknown type "${type}". Expected one of: ${[...KNOWN_TYPES].join(", ")}.`,
        });
      }

      let body = "";

      for await (const chunk of req) {
        body += chunk;
      }

      let opts = {};

      try {
        opts = JSON.parse(body || "{}");
      } catch {
        // ignore parse error
      }

      log(
        `Dashboard triggered scan for "${type}" (deep: ${!!opts.deep}, limit: ${opts.limit || 50})...`
      );
      broadcast("progress", {
        ts: new Date().toISOString(),
        message: `Starting scan for ${type}...`,
      });

      try {
        const { runScan } = await import("./cli/scan.mjs");
        const scanArgs = [];

        if (opts.deep) scanArgs.push("--deep");

        if (opts.limit) {
          scanArgs.push("--limit");
          scanArgs.push(String(opts.limit));
        }

        scanArgs.push("--type");
        scanArgs.push(type);

        await runScan(scanArgs);
        broadcast("progress", {
          ts: new Date().toISOString(),
          message: `Scan completed for ${type}`,
        });

        return sendJson(res, 200, { ok: true, type });
      } catch (err) {
        log(
          `Scan execution error for ${type}: ${err && err.message ? err.message : err}`
        );

        return sendJson(res, 500, {
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
    }

    // --- POST /api/purge/execute: trigger batch purge and comment edits.
    if (req.method === "POST" && pathname === "/api/purge/execute") {
      let body = "";

      for await (const chunk of req) {
        body += chunk;
      }

      let payload = {};

      try {
        payload = JSON.parse(body || "{}");
      } catch {
        // ignore
      }

      const deletions = payload.deletions || [];
      const commentEdits = payload.commentEdits || {};

      log(
        `Dashboard requested purge execution: ${deletions.length} items to delete, ${Object.keys(commentEdits).length} comment edits.`
      );
      broadcast("progress", {
        ts: new Date().toISOString(),
        message: `Executing batch purge: ${deletions.length} deletions, ${Object.keys(commentEdits).length} edits...`,
      });

      try {
        const { PurgeRunner } = await import("./purge.mjs");
        // Run PurgeRunner with headless mode and provided deletions/edits
        const runner = new PurgeRunner({ headless: true });
        // Execute batch purge
        await runner.executeBatch({ deletions, commentEdits });
        broadcast("progress", {
          ts: new Date().toISOString(),
          message: "Batch purge execution completed successfully.",
        });

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        log(`Purge execution error: ${err && err.message ? err.message : err}`);

        return sendJson(res, 500, {
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
    }

    if (req.method === "POST" && pathname === "/api/shutdown") {
      log("Shutdown endpoint called; stopping server and exiting process.");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, message: "Server shutting down." }, null, 2)
      );

      setTimeout(() => {
        process.exit(0);
      }, 200);

      return "shutdown";
    }

    // --- GET /: serve the live dashboard HTML page.
    if (req.method === "GET" && pathname === "/") {
      const { envelope: commentsEnv } = loadEnvelope(dataDir, "comments");
      const { envelope: likesEnv } = loadEnvelope(dataDir, "likes");
      const html = generateDashboardPage(commentsEnv, likesEnv);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);

      return;
    }

    // --- 404 catch-all.
    return sendJson(res, 404, {
      error: `Not found: ${req.method} ${pathname}`,
    });
  };
}

/**
 * Create and start the dashboard HTTP server.
 *
 * @openapi 3.1
 * {
 *   "openapi": "3.1.0",
 *   "info": {
 *     "title": "LinkedIn Purge Dashboard API",
 *   "version": "0.5.10",
 *     "description": "Local HTTP server for the live purge dashboard: scan envelopes, SSE progress stream, graceful shutdown."
 *   },
 *   "servers": [
 *     { "url": "http://localhost:{port}", "variables": { "port": { "default": 3333, "description": "dashboardPort from config.json" } } }
 *   ],
 *   "paths": {
 *     "/": {
 *       "get": {
 *         "summary": "Live dashboard page",
 *         "description": "Renders the single-page live dashboard HTML with tabbed navigation and rich metadata rendering.",
 *         "responses": { "200": { "description": "HTML dashboard page", "content": { "text/html": { "schema": { "type": "string" } } } } }
 *       }
 *     },
 *     "/api/envelope/{type}": {
 *       "get": {
 *         "summary": "Load a scan envelope",
 *         "description": "Serves the scan envelope JSON written by a scan for one item type.",
 *         "parameters": [
 *           { "name": "type", "in": "path", "required": true, "schema": { "type": "string", "enum": ["comments", "likes"] } }
 *         ],
 *         "responses": {
 *           "200": { "description": "Scan envelope", "content": { "application/json": { "schema": { "type": "object" } } } },
 *           "400": { "description": "Unknown type" },
 *           "404": { "description": "Envelope not found" }
 *         }
 *       }
 *     },
 *     "/api/purge/stream": {
 *       "get": {
 *         "summary": "SSE progress stream",
 *         "description": "Server-Sent Events stream emitting hello, progress and shutdown events.",
 *         "responses": { "200": { "description": "Event stream", "content": { "text/event-stream": { "schema": { "type": "string" } } } } }
 *       }
 *     },
 *     "/api/shutdown": {
 *       "post": {
 *         "summary": "Gracefully stop the server",
 *         "responses": { "200": { "description": "Shutting down", "content": { "application/json": { "schema": { "type": "object" } } } } }
 *       }
 *     }
 *   }
 * }
 *
 * @param {object} [options] - Server creation options.
 * @param {number} [options.port] - Port to listen on; defaults to dashboardPort from config.json.
 * @param {string} [options.dataDir] - Directory holding scan envelopes; defaults to "data".
 * @returns {{ server: http.Server, close: () => void, url: string }} Server handle.
 */
export function createServer({ port, dataDir } = {}) {
  const resolvedPort = port ?? resolveDashboardPort();
  const resolvedDataDir = dataDir ?? "data";
  const handleRequest = createRequestHandler(resolvedDataDir);

  let serverClosing = false;

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => handleRequest(req, res))
      .then((outcome) => {
        if (outcome === "shutdown" && !serverClosing) {
          serverClosing = true;
          log("Shutdown signal received; closing HTTP server.");
          server.close(() => {
            log("HTTP server stopped.");
          });
        }
      })
      .catch((e) => {
        if (!res.headersSent) {
          sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
        }
      });
  });

  server.listen(resolvedPort, () => {
    log(`Dashboard API listening on http://localhost:${resolvedPort}`);
  });

  return {
    server,
    close: () => {
      if (serverClosing) return;
      serverClosing = true;
      server.close(() => {
        log("HTTP server closed via close().");
      });
    },
    url: `http://localhost:${resolvedPort}`,
  };
}

/**
 * Gracefully stop the running dashboard server and exit the process.
 *
 * @openapi 3.1
 * {
 *   "openapi": "3.1.0",
 *   "info": { "title": "LinkedIn Purge Dashboard API", "version": "0.5.10" },
 *   "paths": {
 *     "/api/shutdown": {
 *       "post": {
 *         "summary": "Gracefully stop the server process",
 *         "responses": {
 *           "200": { "description": "Server is shutting down", "content": { "application/json": { "schema": { "type": "object" } } } }
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * @param {http.Server} server - The server instance returned by createServer().
 * @param {number} [code] - Process exit code to use when the listener has closed.
 * @returns {void}
 */
export function stopServer(server, code = 0) {
  if (server.listening) {
    server.close(() => {
      log(`stopServer: listener closed, exiting with code ${code}.`);
      process.exit(code);
    });

    // Safety net: force exit if close does not complete within 5 seconds.
    setTimeout(() => {
      log("stopServer: force exit after close timeout.");
      process.exit(code);
    }, 5000);
  }
}
