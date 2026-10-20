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
  /** League/year/split combinations that have games; league is null for internationals. */
  combos: { league: string | null; year: number; split: string | null }[]
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
  /** A line under the label; only the all-time range has one. */
  description?: string
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
  /** The team's final placement as Leaguepedia writes it ("1", "3-4", "Q"); null while the event runs or when unknown. */
  placement?: { place: string; group: string | null } | null
  /** The team the player played for in this event (player pages). */
  team?: string
  id: number
  /** The readable address segment (`worlds-2025`). */
  slug: string
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
  tournamentSlug: string
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

export interface InternationalAccomplishment {
  key: 'worlds' | 'msi' | 'firstStand'
  label: string
  appearances: number
  /** Their best finish and every event they had it in, oldest first; null while no placement is known. */
  best: { place: string; events: ContextEvent[] } | null
}

export interface TitleAccomplishment {
  count: number
  mostRecent: ContextEvent | null
}

export interface RegionAccomplishments {
  region: string
  league: string
  splitsPlayed: number
  lastSplit: { year: number; split: string; event: ContextEvent } | null
  playoffsFirst: TitleAccomplishment
  playoffsSecond: TitleAccomplishment
}

export interface PlayerAccomplishmentsResponse {
  international: InternationalAccomplishment[]
  /** One block per region the player has played a split in, the most recent first. */
  regions: RegionAccomplishments[]
}

/** A run with one team, from Leaguepedia's roster changes (not from games played). */
export interface TeamStint {
  /** The team's current name. */
  team: string
  /** Our team page, when we hold games for the team; null for a team known only from the roster log. */
  teamPage: string | null
  region: string | null
  role: string | null
  /** "Sub" or "Trainee". */
  modifier: string | null
  /** YYYY-MM-DD. */
  start: string
  /** YYYY-MM-DD; null while the stint is running (or when endUnknown). */
  end: string | null
  /** A Join with no Leave and nothing written about the player for years: not known to be running. */
  endUnknown: boolean
  /** Inactive when the stint ended (or is now). */
  inactive: boolean
  loan: boolean
}

export interface PlayerTeamHistoryResponse {
  /** Newest first. */
  stints: TeamStint[]
}

/** What the filter bar needs from any page's range: whether it is the default, and what that resolved to. */
export interface FilterRange {
  isDefault: boolean
  resolved: { league?: string; year: number; split: string | null } | null
  /** Each league's own latest split when the default range spans several leagues. */
  leagues?: { league: string; year: number; split: string | null }[]
}

export interface ChampionSummary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  pickRate: number | null
  banRate: number | null
  presence: number | null
  totalGames: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  goldPerMin: number | null
  csPerMin: number | null
  avgGameLengthSec: number | null
  role: string | null
}

export interface ChampionResponse {
  champion: { id: number; name: string }
  range: LeaderboardRange
  empty: boolean
  summary: ChampionSummary | null
}

export interface ChampionRoleRow {
  role: string
  games: number
  wins: number
  winRate: number
}

export interface ChampionPlayer {
  page: string
  name: string
  team: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  underMinSample: boolean
}

export interface ChampionTeam {
  name: string
  games: number
  wins: number
  winRate: number
  underMinSample: boolean
}

export interface ChampionCounter {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

export interface ChampionPatchRow {
  patch: string
  games: number
  wins: number
  winRate: number
  pickRate: number | null
}

export interface ChampionContextResponse {
  champion: { id: number; name: string }
  players: ChampionPlayer[]
  teams: ChampionTeam[]
  events: (ContextEvent & { games: number })[]
}

export interface TournamentInfo {
  id: number
  /** The readable address segment (`worlds-2025`); the page moves to it if it was opened by a numeric id. */
  slug: string
  name: string
  leaguepediaName: string
  league: string | null
  leagues: string[]
  year: number
  split: string | null
  stage: string | null
  isInternational: boolean
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
}

export interface TournamentSummary {
  games: number
  series: number
  teams: number
  avgGameLengthSec: number | null
  blueWinRate: number | null
  killsPerGame: number | null
  patches: string[]
  standingLabel: string
  standingTeam: string | null
}

export interface TournamentResponse {
  tournament: TournamentInfo
  empty: boolean
  summary: TournamentSummary | null
}

export interface StandingRow {
  team: string
  seriesWins: number
  seriesLosses: number
  gameWins: number
  gameLosses: number
  gameWinRate: number
}

export interface SeriesRow {
  seriesId: number
  at: string | null
  team1: string | null
  team2: string | null
  winner: string | null
  score: string | null
  bestOf: number | null
}

export interface MatchesResponse {
  empty: boolean
  upcoming: SeriesRow[]
  results: SeriesRow[]
}

export interface TournamentPlayer {
  page: string
  name: string
  team: string | null
  role: string | null
  games: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
}

export interface RosterPlayer {
  page: string
  name: string
  role: string | null
  games: number
}

export interface TeamRoster {
  team: string
  players: RosterPlayer[]
}

export interface RostersResponse {
  empty: boolean
  teams: TeamRoster[]
}

export interface SeriesPick {
  champion: string
  role: string | null
  /** The player's page name, for the link. */
  page: string
  player: string
  /** Place 1-5 in the team's draft; null when unknown. */
  pickOrder: number | null
}

export interface SeriesSide {
  side: 'blue' | 'red'
  team: string
  win: boolean
  kills: number | null
  /** Champion names in ban-slot order. */
  bans: string[]
  picks: SeriesPick[]
}

export interface SeriesGame {
  gameId: number
  /** 1, 2, 3 ... in played order. */
  number: number
  lengthSec: number | null
  patch: string | null
  /** Blue side first. */
  sides: SeriesSide[]
}

export interface SeriesGamesResponse {
  series: SeriesRow
  games: SeriesGame[]
}

export interface TournamentChampion {
  champion: string
  picks: number
  wins: number
  winRate: number | null
  bans: number
  presence: number
}

export interface TournamentContextResponse {
  teams: StandingRow[]
  upcoming: SeriesRow[]
  results: SeriesRow[]
  related: { id: number; slug: string; name: string; league: string; status: 'In progress' | 'Completed'; startDate: string | null; endDate: string | null }[]
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
  tournaments: { id: number; slug: string; name: string; status: 'In progress' | 'Completed' }[]
}

export interface RecentTournament {
  id: number
  slug: string
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

export interface ListResponse<T> {
  range: LeaderboardRange
  minGames: number
  total: number
  page: number
  pageSize: number
  empty: boolean
  rows: T[]
}

export interface TeamListRow {
  rank: number
  name: string
  league: string | null
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  killsPerGame: number | null
  towersPerGame: number | null
  avgGameLengthSec: number | null
}

export interface ChampionListRow {
  rank: number
  name: string
  role: string | null
  games: number
  wins: number
  winRate: number | null
  pickRate: number | null
  banRate: number | null
  presence: number | null
  kda: number | null
  underMinSample: boolean
}

export interface TournamentListRow {
  id: number
  slug: string
  name: string
  league: string
  stage: string | null
  year: number
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
  games: number
  standingLabel: string
  standingTeam: string | null
}

export interface TournamentListResponse {
  total: number
  page: number
  pageSize: number
  empty: boolean
  rows: TournamentListRow[]
}

export interface BracketSlot {
  team: string | null
  region: string | null
  score: number | null
  won: boolean
  /** The earlier series this team came from, and whether it won or lost there (null while that one is unplayed). */
  from: { seriesId: number; as: 'won' | 'lost' | null } | null
}

export interface StageSeries {
  seriesId: number
  n: number | null
  bestOf: number | null
  at: string | null
  played: boolean
  slots: [BracketSlot, BracketSlot]
  /** Knockout only: upper (nobody has lost), lower (someone has), final (the last series). */
  lane?: 'upper' | 'lower' | 'final'
}

export interface StageRound {
  name: string
  order: number
  series: StageSeries[]
}

export interface SwissRow {
  team: string
  region: string | null
  wins: number
  losses: number
  results: ('W' | 'L')[]
}

export interface TournamentStage {
  key: 'playin' | 'groups' | 'swiss' | 'knockout'
  label: string
  rounds: StageRound[]
  /** Swiss stages only: every team with its record, best first. */
  standings?: SwissRow[]
}

export interface StagesResponse {
  empty: boolean
  stages: TournamentStage[]
}

/** The one range a comparison applies to both subjects; `resolved.league` is absent when it spans leagues. */
export interface CompareRange extends Omit<Range, 'resolved'> {
  resolved: { league?: string; year: number; split: string | null } | null
}

export interface ComparePlayerSide {
  player: PlayerResponse['player']
  summary: Summary | null
  champions: ChampionRow[]
}

export interface PlayerHeadToHead {
  games: number
  wins: number
  losses: number
  laneGames: number
  laneWins: number
  togetherGames: number
  togetherWins: number
}

export interface ComparePlayersResponse {
  range: CompareRange
  empty: boolean
  a: ComparePlayerSide
  b: ComparePlayerSide
  headToHead: PlayerHeadToHead
}

export interface CompareTeamSide {
  team: TeamResponse['team']
  summary: TeamSummary | null
  /** The roster first (current: true), then former players; each group in role order. */
  players: (TeamPlayer & { current: boolean })[]
  /** The event whose lineup counts as the roster, and whether it is the team's latest event overall. */
  rosterEvent: { name: string; isLatest: boolean } | null
  picks: TeamPick[]
}

export interface TeamMeeting {
  playedAt: string | null
  tournament: string
  winner: string | null
}

export interface TeamHeadToHead {
  games: number
  wins: number
  losses: number
  seriesPlayed: number
  seriesWins: number
  seriesLosses: number
  recent: TeamMeeting[]
}

export interface CompareTeamsResponse {
  range: CompareRange
  empty: boolean
  a: CompareTeamSide
  b: CompareTeamSide
  headToHead: TeamHeadToHead
}
