import type { ChampionResponse, PlayerResponse, TeamResponse, TournamentResponse } from '../api/types'
import { dateRange, decimal, percent } from './format'

/** Page titles and descriptions as search results show them. Numbers come from the data on screen; no data, no numbers. */
export interface Seo {
  title: string
  description: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** "in LCK 2026 Summer", or "across all of history" for the all-time range. */
const inRange = (label: string) => (label === 'All time' ? 'across all of history' : `in ${label}`)

export function playerSeo(name: string, data: PlayerResponse | null | undefined): Seo {
  const title = `${data?.player.displayName ?? name} stats: win rate, KDA and champion pool`
  const p = data?.player
  const s = data?.summary
  if (!p || !s) return { title, description: `${p?.displayName ?? name} pro League of Legends stats: win rate, KDA, champion pool, matchups and target bans.` }
  const who = [p.team, p.role].filter(Boolean).join(', ')
  return {
    title,
    description: `${p.displayName}${who ? ` (${who})` : ''}: ${percent(s.winRate)} win rate and ${decimal(s.kda)} KDA over ${plural(s.games, 'game')} ${inRange(data.range.label)}. Champion pool, lane matchups and target bans.`,
  }
}

export function teamSeo(name: string, data: TeamResponse | null | undefined): Seo {
  const title = `${name} stats: results, roster and drafts`
  const s = data?.summary
  if (!data || !s) return { title, description: `${name} pro League of Legends stats: results, roster, draft tendencies and records against every opponent.` }
  const league = data.team.league ? ` (${data.team.league})` : ''
  return {
    title,
    description: `${name}${league}: ${percent(s.winRate)} win rate over ${plural(s.games, 'game')} ${inRange(data.range.label)}. Roster, draft tendencies and records against every opponent.`,
  }
}

export function championSeo(name: string, data: ChampionResponse | null | undefined): Seo {
  const title = `${name} pro stats: pick rate, win rate and matchups`
  const s = data?.summary
  if (!data || !s) return { title, description: `${name} in pro League of Legends: presence, win rate, top players, top teams and counters.` }
  const presence = s.presence != null ? `${percent(s.presence)} presence and a ` : 'a '
  return {
    title,
    description: `${name} in pro play: ${presence}${percent(s.winRate)} win rate over ${plural(s.games, 'game')} (${data.range.label}). Top players, teams and counters.`,
  }
}

export function tournamentSeo(data: TournamentResponse | null | undefined): Seo {
  if (!data) return { title: 'Tournament: bracket, standings and stats', description: 'Pro League of Legends tournament: bracket, standings, results, top players and champions.' }
  const t = data.tournament
  const s = data.summary
  // before the first game there are no numbers to quote, only the dates and what the page shows
  if (t.status === 'Upcoming') {
    return {
      title: `${t.name}: schedule and bracket`,
      description: `${t.name} (upcoming, ${dateRange(t.startDate, t.endDate)}): schedule, bracket and the teams taking part.`,
    }
  }
  const detail = s ? `${plural(s.series, 'series', 'series')}, ${plural(s.games, 'game')} and ${plural(s.teams, 'team')}` : t.status.toLowerCase()
  return {
    title: `${t.name}: bracket, standings and stats`,
    description: `${t.name} (${t.status.toLowerCase()}): ${detail}. Bracket, standings, results, top players and champions.`,
  }
}

/* ---------------------------------------------------------------- schema.org (JSON-LD) */

const here = () => `${window.location.origin}${window.location.pathname.replace(/(.)\/+$/, '$1')}`
const SPORT = 'League of Legends'

export function playerLd(data: PlayerResponse | null | undefined): Record<string, unknown> | null {
  const p = data?.player
  if (!p) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.displayName,
    jobTitle: 'Professional League of Legends player',
    url: here(),
    ...(p.team ? { memberOf: { '@type': 'SportsTeam', name: p.team, sport: SPORT } } : {}),
  }
}

export function teamLd(data: TeamResponse | null | undefined): Record<string, unknown> | null {
  if (!data) return null
  return { '@context': 'https://schema.org', '@type': 'SportsTeam', name: data.team.name, sport: SPORT, url: here() }
}

export function tournamentLd(data: TournamentResponse | null | undefined): Record<string, unknown> | null {
  const t = data?.tournament
  if (!t) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.name,
    sport: SPORT,
    url: here(),
    ...(t.startDate ? { startDate: t.startDate } : {}),
    ...(t.endDate ? { endDate: t.endDate } : {}),
  }
}

/** Title and description for a player, team, champion or tournament the database does not have. */
export const notFoundSeo = (kind: 'Player' | 'Team' | 'Champion' | 'Tournament'): Seo => ({
  title: `${kind} not found`,
  description: `This ${kind.toLowerCase()} is not in the Oracle Lens database.`,
})
