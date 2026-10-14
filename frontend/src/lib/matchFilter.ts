import type { SeriesRow } from '../api/types'

/** The visitor's calendar day of a match as YYYY-MM-DD, the same day `matchTime` shows; null when it has no date. */
export function localDay(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Thu, Oct 8" for a YYYY-MM-DD day, with the year added when it is not the current one. */
export function dayLabel(day: string, now: Date = new Date()): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Series that involve `team`, or all of them when no team is set. */
export function filterMatches(rows: SeriesRow[], team: string | null): SeriesRow[] {
  return team ? rows.filter((s) => s.team1 === team || s.team2 === team) : rows
}

/** Every team that appears in the lists, A to Z. */
export function teamOptions(...lists: SeriesRow[][]): string[] {
  const teams = new Set<string>()
  for (const list of lists) {
    for (const s of list) {
      if (s.team1) teams.add(s.team1)
      if (s.team2) teams.add(s.team2)
    }
  }
  return [...teams].sort((a, b) => a.localeCompare(b))
}

export interface DayGroup {
  /** YYYY-MM-DD, or null for matches with no date yet. */
  day: string | null
  rows: SeriesRow[]
}

/** Splits an already ordered list into consecutive runs that share a day, keeping the order of the rows. */
export function groupByDay(rows: SeriesRow[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const s of rows) {
    const day = localDay(s.at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.rows.push(s)
    else groups.push({ day, rows: [s] })
  }
  return groups
}
