// Results retention presets a host can pick when starting a session
// (DESIGN.md §7, PRD §3: "configurable TTL, default 24h"). A fixed set
// rather than free input — the options the design names, and nothing a
// host could fat-finger into keeping results for a year.
export const RESULTS_TTL_PRESET_HOURS = [1, 6, 24] as const;

/** Resolves the requested retention for a new session: omitted -> the
 * server default; one of the presets -> that; anything else -> undefined
 * (the caller rejects it with a 400). */
export function resolveResultsTtlHours(requested: unknown, fallbackHours: number): number | undefined {
  if (requested === undefined || requested === null) return fallbackHours;
  return (RESULTS_TTL_PRESET_HOURS as readonly unknown[]).includes(requested) ? (requested as number) : undefined;
}
