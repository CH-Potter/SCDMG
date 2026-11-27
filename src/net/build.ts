// This build's identity for online play: both players must run exactly the same release, because
// balance numbers and pricing change between versions (docs/pvp-feasibility.md §5.5).

/** "0.12.1+4b99f26": package.json's version and the git commit it was built from. */
export const BUILD = `${__APP_VERSION__}+${__APP_COMMIT__}`;
