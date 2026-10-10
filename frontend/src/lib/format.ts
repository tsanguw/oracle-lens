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

/** "Sat, Oct 10 · 9:00 AM" in the visitor's own time zone. */
export const matchTime = (iso: string | null): string => {
  if (!iso) return 'Date TBD'
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** "Sep 5 – Oct 10, 2026" from two ISO dates (YYYY-MM-DD); either may be missing. */
export const dateRange = (start: string | null, end: string | null): string => {
  if (!start && !end) return NA
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  if (!start || !end) return fmt((start ?? end)!, true)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`
}

/** "LYON (2024 American Team)" -> "LYON": Leaguepedia adds the bracket to tell same-named teams apart; it is noise on screen. */
export const shortTeam = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '') || name

const ordinal = (n: number): string => {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** "1" -> "1st", "3-4" -> "3rd-4th", "Q" -> "Qualified"; anything unexpected is shown as written. */
export function placeLabel(place: string): string {
  const text = place.trim()
  if (/^\d+$/.test(text)) return ordinal(Number(text))
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return `${ordinal(Number(range[1]))}-${ordinal(Number(range[2]))}`
  if (text === 'Q') return 'Qualified'
  if (text === 'NQ') return 'Not qualified'
  return text
}
