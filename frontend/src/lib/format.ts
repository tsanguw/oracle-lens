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

/** Signed average gold difference, e.g. "+2.1k gold" or "-350 gold". */
export const goldDiff = (v: number | null | undefined): string => {
  if (v == null) return NA
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  return `${sign}${abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs)} gold`
}

/** "Opposing mid laners", "Opposing junglers", ... for the vs-players panel subtitle. */
export const opposingLabel = (role: string | null | undefined): string => {
  switch (role) {
    case 'Jungle':
      return 'Opposing junglers'
    case 'Support':
      return 'Opposing supports'
    case 'Top':
    case 'Mid':
    case 'Bot':
      return `Opposing ${role.toLowerCase()} laners`
    default:
      return 'Opposing laners'
  }
}

export const rate =(wins: number, games: number): number | null => (games > 0 ? wins / games : null)
