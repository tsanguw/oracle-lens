/** Stats that are not tracked (NULL in the database) always display as N/A, never 0. */
export const NA = 'N/A'

export const percent = (v: number | null | undefined, digits = 0): string =>
  v == null ? NA : `${(v * 100).toFixed(digits)}%`

export const decimal = (v: number | null | undefined, digits = 1): string =>
  v == null ? NA : v.toFixed(digits)

export const whole = (v: number | null | undefined): string => (v == null ? NA : String(Math.round(v)))

export const duration = (seconds: number | null | undefined): string => {
  if (seconds == null) return NA
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export const rate = (wins: number, games: number): number | null => (games > 0 ? wins / games : null)
