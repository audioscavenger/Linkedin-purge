// Main purge module: the entry point to the purge module.
// PurgeRunner owns the lifecycle; the four adapters are its seams.
export { PurgeRunner } from "./purge/runner.mjs";
export { PageAdapter } from "./purge/adapters/page-adapter.mjs";
export { ConfirmAdapter } from "./purge/adapters/confirm-adapter.mjs";
