export interface Summary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  kills: number | null
  deaths: number | null
  assists: number | null
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  damageShare: number | null
  goldPerMin: number | null
  goldShare: number | null
  csPerMin: number | null
  visionPerMin: number | null
  firstBloodRate: number | null
  championPool: number
  avgGameLengthSec: number | null
}

export interface Range {
  label: string
  description: string
  isDefault: boolean
  domesticOnly: boolean
  from: string | null
  to: string | null
  resolved: { league: string; year: number; split: string | null } | null
}

export interface PlayerResponse {
  player: {
    id: number
    name: string
    displayName: string
    nationality: string | null
    role: string | null
    team: string | null
    league: string | null
  }
  range: Range
  empty: boolean
  summary: Summary | null
}

export interface ChampionRow {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  kda: number | null
  csPerMin: number | null
  damagePerMin: number | null
  underMinSample: boolean
}

export interface ChampionsResponse {
  range: Range
  empty: boolean
  champions: ChampionRow[]
}

export interface PlayerMatchup {
  playerId: number
  page: string
  name: string
  team: string | null
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

export interface ChampionMatchup {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

export interface PlayerMatchupsResponse {
  range: Range
  empty: boolean
  matchups: PlayerMatchup[]
}

export interface ChampionMatchupsResponse {
  range: Range
  empty: boolean
  matchups: ChampionMatchup[]
}

export interface TargetBan {
  champion: string
  games: number
  rate: number
}

export interface TargetBansResponse {
  range: Range
  empty: boolean
  bans: TargetBan[]
}

export interface FiltersResponse {
  leagues: string[]
  years: number[]
  splits: string[]
  patches: string[]
}

export interface LastUpdatedResponse {
  lastUpdated: string | null
}

export interface LeaderboardRow {
  rank: number
  page: string
  name: string
  team: string | null
  league: string | null
  role: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  csPerMin: number | null
  visionPerMin: number | null
}

export interface LeaderboardRange {
  label: string
  isDefault: boolean
  resolved: { year: number; split: string | null } | null
  leagues: { league: string; year: number; split: string | null }[]
}

export interface LeaderboardResponse {
  range: LeaderboardRange
  minGames: number
  total: number
  page: number
  pageSize: number
  empty: boolean
  players: LeaderboardRow[]
}

export interface ContextEvent {
  id: number
  name: string
  league: string
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
}

export interface ContextMatch {
  seriesId: number
  scheduledAt: string | null
  tournamentId: number
  tournament: string
  opponent: string | null
  bestOf: number | null
  score: string | null
  won: boolean | null
}

export interface RosterPlayer {
  page: string
  name: string
  role: string | null
  games: number
  starter: boolean
  isViewed: boolean
}

export interface PlayerContextResponse {
  team: { name: string; league: string | null; isCurrent: boolean; lastPlayed: string | null } | null
  roster: RosterPlayer[]
  events: ContextEvent[]
  upcoming: ContextMatch[]
  results: ContextMatch[]
}

export interface TeamSummary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  avgGameLengthSec: number | null
  killsPerGame: number | null
  deathsPerGame: number | null
  goldPerMin: number | null
  towersPerGame: number | null
  dragonsPerGame: number | null
  baronsPerGame: number | null
  heraldsPerGame: number | null
  voidGrubsPerGame: number | null
  goldDiff: number | null
}

export interface TeamResponse {
  team: { id: number; name: string; region: string | null; league: string | null }
  range: Range
  empty: boolean
  summary: TeamSummary | null
}

export interface TeamPlayer {
  page: string
  name: string
  role: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  csPerMin: number | null
  underMinSample: boolean
}

export interface TeamPlayersResponse {
  range: Range
  empty: boolean
  players: TeamPlayer[]
}

export interface TeamPick {
  champion: string
  games: number
  wins: number
  winRate: number
  underMinSample: boolean
}

export interface TeamBan {
  champion: string
  games: number
  rate: number
}

export interface TeamDraftResponse {
  range: Range
  empty: boolean
  picks: TeamPick[]
  bans: TeamBan[]
  bansAgainst: TeamBan[]
}

export interface TeamOpponent {
  team: string
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

export interface TeamOpponentsResponse {
  range: Range
  empty: boolean
  opponents: TeamOpponent[]
}

export interface TeamContextResponse {
  team: { id: number; name: string; region: string | null }
  league: string | null
  roster: RosterPlayer[]
  events: ContextEvent[]
  upcoming: ContextMatch[]
  results: ContextMatch[]
}

export interface SearchResponse {
  players: { page: string; name: string; role: string | null; team: string | null }[]
  teams: { name: string; league: string | null }[]
  champions: { name: string; role: string | null }[]
  tournaments: { id: number; name: string; status: 'In progress' | 'Completed' }[]
}

export interface RecentTournament {
  id: number
  name: string
  league: string
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
  standingLabel: string | null
  standingTeam: string | null
}

export interface RecentTournamentsResponse {
  tournaments: RecentTournament[]
}
