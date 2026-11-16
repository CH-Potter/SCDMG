// Dependency-free engine constants (safe to import from validators and UI without pulling in the engine).

/** Most command points a player can bank. */
export const CP_CAP = 8;

/** A side that leads by more than this many VP at any moment wins on the spot. */
export const MERCY_LEAD = 8;

/** Blast weapons roll an extra die per attacking model against units with at least this many models left. */
export const BLAST_SQUAD = 7;

/** Radius of the burst where an indirect shell (mortar, Barrage) lands; every model under it is rolled for. */
export const SHELL_BURST = 2;

/** An indirect shell that misses its mark drifts up to this many inches (one d6), half that if a firing model can see the spot. */
export const SHELL_DRIFT = 6;
