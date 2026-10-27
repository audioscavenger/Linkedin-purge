// Main purge module: the entry point to the purge module.
// PurgeRunner owns the lifecycle; the four adapters are its seams.
export { PurgeRunner } from "./purge/runner.js";
export { PageAdapter } from "./purge/adapters/page-adapter.js";
export { CheckpointAdapter } from "./purge/adapters/checkpoint-adapter.js";
export { ReporterAdapter } from "./purge/adapters/reporter-adapter.js";
export { ConfirmAdapter } from "./purge/adapters/confirm-adapter.js";
