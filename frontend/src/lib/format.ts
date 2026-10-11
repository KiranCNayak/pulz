const numberFormat = new Intl.NumberFormat()

/** Locale-aware thousands grouping for scores (a game's totals run into the
 * thousands since Decision #67's 500-1000 points per answer). */
export function formatNumber(value: number): string {
  return numberFormat.format(value)
}
