/// <reference types="vite/client" />

/** package.json's version, set at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string;
/** The short git commit of the build, or "unknown" when built outside a git checkout. */
declare const __APP_COMMIT__: string;
