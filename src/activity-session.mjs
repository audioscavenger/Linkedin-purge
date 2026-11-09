/*
  Activity Session: the one browser bootstrap shared by scan and purge.

  A command resolves its paths and browser mode, then hands them here. The
  session owns everything between that and "a page parked on one Activity List
  tab": the launch (or CDP attach), the page, the injected window.LP helpers
  (src/linkedin-dom.js), the login guard (src/login-guard.js), the /in/me round
  trip that names the profile, and the per-target navigation (src/activity-targets.js).

  Because both commands go through this module, they cannot disagree about the
  guard points, the settle waits or the URL they derive - the drift that had
  grown between their two hand-written copies. `login` stays outside: it opens
  the login page headed and waits for a keypress, not an Activity List.
*/
import path from "node:path";
import { launchBrowser, connectCDP, injectDomHelpers } from "./browser.mjs";
import { isLoggedOut } from "./login-guard.mjs";
import { warn } from "./logger.mjs";

const PROFILE_URL = "https://www.linkedin.com/in/me/";
const PROFILE_SLUG = /linkedin\.com\/in\/([^/]+)/;

/*
  How long a page gets to settle before the guard is asked. These are
  page-load tolerances, not user preference, so they are constants: one value
  per point keeps scan and purge from being accidentally more or less patient.
*/
export const PROFILE_SETTLE_MS = 3000;
export const TARGET_SETTLE_MS = 8000;

export const SESSION_EXPIRED_MESSAGE =
  "Not logged in. Run `npm run login` first.";

/*
  Thrown when LinkedIn answers with a login, checkpoint or authwall redirect.
  `friendly` makes the CLI print the message alone, with no stack.
*/
export class SessionExpiredError extends Error {
  constructor(message = SESSION_EXPIRED_MESSAGE) {
    super(message);
    this.name = "SessionExpiredError";
    this.friendly = true;
  }
}

export class ActivitySession {
  constructor({ context, page, baseUrl, browser = null, wait }) {
    this.context = context;
    this.page = page;
    this.baseUrl = baseUrl;
    this.browser = browser;
    this.wait = wait;
    this.closed = false;
  }

  /**
   * Open Chromium (or attach over CDP), inject the in-page helpers, prove the
   * session is alive and derive the profile's Activity List base URL.
   *
   * On any failure the browser or context opened so far is closed again, so a
   * dead session leaves no browser behind. `launch`, `attach`, `inject` and
   * `wait` are injectable so tests can drive the whole open without a browser.
   *
   * @param {object} options
   * @param {string} options.profileDir Chromium profile directory (launch path).
   * @param {boolean} [options.headless=true] Browser mode (launch path).
   * @param {string|null} [options.chromiumPath=null] Chromium binary (launch path).
   * @param {string|null} [options.cdp=null] CDP endpoint; attaches instead of launching.
   * @returns {Promise<ActivitySession>}
   * @throws {SessionExpiredError} when the profile visit lands on a login page.
   */
  static async open({
    profileDir,
    headless = true,
    chromiumPath = null,
    cdp = null,
    helperPath = path.resolve("./src/linkedin-dom.mjs"),
    launch = launchBrowser,
    attach = connectCDP,
    inject = injectDomHelpers,
    wait = defaultWait,
  }) {
    let browser = null;
    let context = null;
    try {
      if (cdp) {
        const attached = await attach(cdp);
        browser = attached.browser || null;
        context = attached.context;
      } else {
        context = await launch({ profileDir, headless, chromiumPath });
      }
      const page = await context.newPage();
      await inject(page, helperPath);

      await page.goto(PROFILE_URL, { waitUntil: "domcontentloaded" });
      await wait(PROFILE_SETTLE_MS);
      ensureLoggedIn(page);

      return new ActivitySession({
        context,
        page,
        baseUrl: activityBaseUrl(page.url()),
        browser,
        wait,
      });
    } catch (error) {
      await closeQuietly(browser, context);
      throw error;
    }
  }

  /**
   * Navigate to one Activity target's tab, check the session again, and hand
   * back the page. Callers never get a page without this guard, which is the
   * one rule the module exists to guarantee.
   *
   * @param {{type: string, tab: string}} target From activityTargets().
   * @returns {Promise<object>} The Playwright page parked on the tab.
   * @throws {SessionExpiredError} when the tab navigation lands on a login page.
   */
  async openTarget(target) {
    await this.page.goto(this.baseUrl + target.tab, {
      waitUntil: "domcontentloaded",
    });
    await this.wait(TARGET_SETTLE_MS);
    ensureLoggedIn(this.page);
    return this.page;
  }

  /**
   * Close what this session opened: the browser on the CDP path, the context
   * on the launch path. Idempotent, so a command can close in a `finally`
   * without tracking whether the session is already gone.
   */
  async close() {
    if (this.closed) return;
    this.closed = true;
    await closeQuietly(this.browser, this.context);
  }
}

// Default wait: a plain timer, injected away in tests so nothing sleeps.
function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The profile slug from the /in/me redirect, or "me" when the URL carries none.
function activityBaseUrl(url) {
  const match = PROFILE_SLUG.exec(url || "");
  const username = match ? match[1] : "me";
  return `https://www.linkedin.com/in/${username}/recent-activity/`;
}

// One guard, called at both points a run comes back from a navigation.
function ensureLoggedIn(page) {
  if (isLoggedOut(page)) throw new SessionExpiredError();
}

// Closing is best effort: a browser that already died must not mask the error
// that is on its way to the caller.
async function closeQuietly(browser, context) {
  try {
    if (browser) await browser.close();
    else if (context) await context.close();
  } catch (error) {
    warn(`Could not close the browser cleanly: ${error.message}`);
  }
}
