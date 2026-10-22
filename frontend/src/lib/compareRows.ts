import type { Summary, TeamSummary } from '../api/types'
import { decimal, duration, goldDiff, percent, whole } from './format'

export interface StatRow<S> {
  label: string
  value: (s: S) => number | null
  format: (v: number | null) => string
  /** Which direction wins; omitted for figures that describe style, not strength (games played, game length). */
  better?: 'high' | 'low'
}

const dec2 = (v: number | null) => decimal(v, 2)
const pct = (v: number | null) => percent(v)

export const PLAYER_ROWS: StatRow<Summary>[] = [
  { label: 'Games', value: (s) => s.games, format: whole },
  { label: 'Win rate', value: (s) => s.winRate, format: pct, better: 'high' },
  { label: 'KDA', value: (s) => s.kda, format: dec2, better: 'high' },
  { label: 'Kills / game', value: (s) => s.kills, format: dec2, better: 'high' },
  { label: 'Deaths / game', value: (s) => s.deaths, format: dec2, better: 'low' },
  { label: 'Assists / game', value: (s) => s.assists, format: dec2, better: 'high' },
  { label: 'Kill participation', value: (s) => s.killParticipation, format: pct, better: 'high' },
  { label: 'Damage / min', value: (s) => s.damagePerMin, format: whole, better: 'high' },
  { label: 'Damage share', value: (s) => s.damageShare, format: pct, better: 'high' },
  { label: 'Gold / min', value: (s) => s.goldPerMin, format: whole, better: 'high' },
  { label: 'Gold share', value: (s) => s.goldShare, format: pct, better: 'high' },
  { label: 'CS / min', value: (s) => s.csPerMin, format: (v) => decimal(v), better: 'high' },
  { label: 'Vision / min', value: (s) => s.visionPerMin, format: (v) => decimal(v), better: 'high' },
  { label: 'First blood', value: (s) => s.firstBloodRate, format: pct, better: 'high' },
  { label: 'Avg game', value: (s) => s.avgGameLengthSec, format: duration },
]

export const TEAM_ROWS: StatRow<TeamSummary>[] = [
  { label: 'Games', value: (s) => s.games, format: whole },
  { label: 'Win rate', value: (s) => s.winRate, format: pct, better: 'high' },
  { label: 'Kills / game', value: (s) => s.killsPerGame, format: (v) => decimal(v), better: 'high' },
  { label: 'Deaths / game', value: (s) => s.deathsPerGame, format: (v) => decimal(v), better: 'low' },
  { label: 'Gold / min', value: (s) => s.goldPerMin, format: whole, better: 'high' },
  { label: 'Gold difference', value: (s) => s.goldDiff, format: goldDiff, better: 'high' },
  { label: 'Towers / game', value: (s) => s.towersPerGame, format: (v) => decimal(v), better: 'high' },
  { label: 'Dragons / game', value: (s) => s.dragonsPerGame, format: dec2, better: 'high' },
  { label: 'Barons / game', value: (s) => s.baronsPerGame, format: dec2, better: 'high' },
  { label: 'Heralds / game', value: (s) => s.heraldsPerGame, format: dec2, better: 'high' },
  { label: 'Void grubs / game', value: (s) => s.voidGrubsPerGame, format: dec2, better: 'high' },
  { label: 'Avg game', value: (s) => s.avgGameLengthSec, format: duration },
]

/** Which side wins a row, judged on the rounded figures shown so a visible tie never gets a highlight. */
export function winner(row: StatRow<never>, a: number | null, b: number | null): 'a' | 'b' | null {
  if (!row.better || a == null || b == null) return null
  if (row.format(a) === row.format(b)) return null
  const aWins = row.better === 'high' ? a > b : a < b
  return aWins ? 'a' : 'b'
}
