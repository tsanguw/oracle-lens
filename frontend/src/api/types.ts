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
