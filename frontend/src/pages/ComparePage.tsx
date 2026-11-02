import { Fragment, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type {
  CompareRange,
  CompareRegionsResponse,
  ComparePlayersResponse,
  CompareTeamSide,
  CompareTeamsResponse,
  FiltersResponse,
  PlayerHeadToHead,
  RegionHeadToHead,
  TeamHeadToHead,
  ChampionRow,
} from '../api/types'
import { useApi } from '../api/useApi'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FilterBar from '../components/FilterBar'
import SeriesGames from '../components/SeriesGames'
import { ChampionIcon, PlayerPhoto, TeamLogo } from '../components/Images'
import VersusHero, { type CompareKind, type HeroRecord, type HeroSide } from '../components/VersusHero'
import VersusTape from '../components/VersusTape'
import { percent } from '../lib/format'
import { PLAYER_ROWS, REGION_ROWS, TEAM_ROWS } from '../lib/compareRows'
import { areaOf } from '../lib/regions'
import { duration } from '../lib/format'
import { tournamentPath } from '../lib/tournamentPath'
import { usePageMeta } from '../lib/usePageMeta'

export type { CompareKind }

const KINDS = ['players', 'teams', 'regions'] as const
const KIND_LABEL: Record<CompareKind, string> = { players: 'Players', teams: 'Teams', regions: 'Regions' }
const SINGULAR: Record<CompareKind, string> = { players: 'player', teams: 'team', regions: 'region' }
type CompareData = ComparePlayersResponse | CompareTeamsResponse | CompareRegionsResponse
/** What a visitor's range choice is made of; widening to all time drops them all. */
const RANGE_PARAMS = ['league', 'year', 'split', 'tournament', 'patch']

/** Same query string everywhere, so the shared range and filters survive picking, swapping and the way back. */
const pathFor = (kind: CompareKind, a: string | null, b: string | null, qs: string) =>
  `/compare/${kind}${a ? `/${encodeURIComponent(a)}` : ''}${a && b ? `/${encodeURIComponent(b)}` : ''}${qs}`

export default function ComparePage({ kind, a, b }: { kind: CompareKind; a: string | null; b: string | null }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const focusB = useLocation().state?.focus === 'b'
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const singular = SINGULAR[kind]

  // Both subjects chosen; until then nothing is fetched, not even the filter options.
  const ready = a !== null && b !== null
  const result = useApi<CompareData>(
    ready ? `/api/compare/${kind}/${encodeURIComponent(a)}/${encodeURIComponent(b)}${qs}` : null,
  )
  const filters = useApi<FiltersResponse>(ready ? '/api/filters' : null)
  const data = result.data
  const bad = result.error?.status === 404 || result.error?.status === 400

  usePageMeta({ title: ready ? `${a} vs ${b}` : `Versus: ${KIND_LABEL[kind]}`, noindex: true })

  const reset = () => setParams(new URLSearchParams())
  const sides = heroSides(kind, a, b, data)
  const nameA = sides.a?.name ?? a ?? ''
  const nameB = sides.b?.name ?? b ?? ''
  // With nothing chosen yet, either half fills side A; the second pick then fills B.
  const pick = (side: 'a' | 'b', value: string) => {
    if (side === 'b' && a) return navigate(pathFor(kind, a, value, qs))
    // side B is still empty after this pick: the page then puts focus in its picker (see RouteEffects)
    const nextB = a ? b : null
    navigate(pathFor(kind, value, nextB, qs), nextB ? undefined : { state: { focus: 'b' } })
  }
  const record: HeroRecord | null = data ? { wins: data.headToHead.wins, losses: data.headToHead.losses, games: data.headToHead.games } : null

  // Widening to all time keeps side and domestic, which narrow games within a range rather than choosing one.
  const showAllTime = () => {
    const next = new URLSearchParams(params)
    for (const key of RANGE_PARAMS) next.delete(key)
    next.set('range', 'all')
    setParams(next)
  }

  return (
    <>
      <main className="main cmp-main" style={{ opacity: data && result.loading ? 0.6 : 1 }}>
        <div className="container">
          <header className="cmp-head">
            <h1 className="cmp-head__title">Versus: {KIND_LABEL[kind]}</h1>
            <nav aria-label="What to compare" className="cmp-kinds">
              {KINDS.map((k) => (
                <Link key={k} to={`/compare/${k}`} className="cmp-kinds__link" aria-current={k === kind ? 'page' : undefined}>
                  {KIND_LABEL[k]}
                </Link>
              ))}
            </nav>
            {ready && (
              <Link className="btn-reset btn-reset--inline" to={pathFor(kind, b, a, qs)}>
                Swap sides
              </Link>
            )}
          </header>
        </div>

        <VersusHero kind={kind} a={sides.a} b={sides.b} onPick={pick} record={record} focusB={focusB} />

        {/* Screen readers hear when a comparison starts loading and what it ended up showing. */}
        <p className="sr-only" role="status" aria-live="polite">
          {ready ? (result.loading ? 'Loading comparison…' : data ? `Showing ${nameA} versus ${nameB}, ${data.range.label}.` : '') : ''}
        </p>

        <div className="container cmp-body">
          {!ready && (
            <p className="section__note">
              {a ? `Choose a second ${singular} to compare.` : `Choose two ${kind} to compare.`} One filter range applies to both.
            </p>
          )}

          {ready && result.error && !bad && <ErrorState message={result.error.message} onRetry={result.reload} />}
          {ready && bad && (
            <div className="empty" role="alert">
              <h2 className="empty__title">{result.error?.status === 400 ? `Pick two different ${kind}` : `Can’t compare these ${kind}`}</h2>
              <p className="empty__text">
                {result.error?.status === 400
                  ? `Both sides are the same ${singular}.`
                  : kind === 'regions'
                    ? 'We only compare LCK, LPL, LEC, LCS, CBLOL and LCP. Pick one of those.'
                    : `We don’t have one of these ${kind}. Check the spelling, or search for another.`}
              </p>
            </div>
          )}

          {ready && !result.error && !data && <CompareSkeleton />}

          {data?.empty && kind !== 'regions' && <EmptyState onReset={reset} />}
          {data?.empty && kind === 'regions' && (
            <div className="empty" role="status">
              <h2 className="empty__title">No meetings in this range</h2>
              <NeverMet range={data.range} onAllTime={showAllTime} text={`${nameA} and ${nameB} teams haven’t played each other in this range.`} />
            </div>
          )}

          {data && !data.empty && (
            <>
              <p className="cmp-range">
                <span className="showing__eyebrow">Same range for both</span> <span className="cmp-range__label">{data.range.label}</span>
                {data.range.description ? <span className="section__note"> · {data.range.description}</span> : null}
              </p>

              <section aria-labelledby="cmp-stats" className="section">
                <div className="section__head">
                  <h2 id="cmp-stats" className="section__title">
                    Tale of the tape
                  </h2>
                  <span className="section__note">
                    {kind === 'regions'
                      ? 'Only games between teams of the two regions. Bars compare the two with each other; the better figure is green and game length is not ranked.'
                      : 'Bars compare the two with each other. The better figure is green; games played and game length are not ranked.'}
                  </span>
                </div>
                {kind === 'players' ? (
                  <VersusTape rows={PLAYER_ROWS} a={(data as ComparePlayersResponse).a.summary} b={(data as ComparePlayersResponse).b.summary} names={[nameA, nameB]} />
                ) : kind === 'regions' ? (
                  <VersusTape rows={REGION_ROWS} a={(data as CompareRegionsResponse).a.summary} b={(data as CompareRegionsResponse).b.summary} names={[nameA, nameB]} />
                ) : (
                  <VersusTape rows={TEAM_ROWS} a={(data as CompareTeamsResponse).a.summary} b={(data as CompareTeamsResponse).b.summary} names={[nameA, nameB]} />
                )}
              </section>

              <section aria-labelledby="cmp-pool" className="section">
                <h2 id="cmp-pool" className="section__title">
                  {kind === 'players' ? 'Champion pools' : kind === 'regions' ? 'Teams in these meetings' : 'Lineups'}
                </h2>
                {kind === 'players' ? (
                  <ChampionPools data={data as ComparePlayersResponse} names={[nameA, nameB]} />
                ) : kind === 'regions' ? (
                  <RegionTeams data={data as CompareRegionsResponse} />
                ) : (
                  <Lineups data={data as CompareTeamsResponse} />
                )}
              </section>

              <section aria-labelledby="cmp-h2h" className="section">
                <h2 id="cmp-h2h" className="section__title">
                  Head to head
                </h2>
                {kind === 'players' ? (
                  <PlayerH2H h={(data as ComparePlayersResponse).headToHead} a={nameA} onAllTime={showAllTime} range={data.range} />
                ) : kind === 'regions' ? (
                  <RegionH2H h={(data as CompareRegionsResponse).headToHead} a={nameA} b={nameB} onAllTime={showAllTime} range={data.range} />
                ) : (
                  <TeamH2H h={(data as CompareTeamsResponse).headToHead} a={nameA} onAllTime={showAllTime} range={data.range} />
                )}
              </section>
            </>
          )}
        </div>
      </main>
      {ready && (
        <FilterBar
          params={params}
          onChange={(next) => setParams(next)}
          options={filters.data}
          range={data?.range ?? null}
          withRole={kind === 'players'}
          only={kind === 'regions' ? ['year', 'patch'] : undefined}
          allTime
        />
      )}
    </>
  )
}

/** What each half of the hero shows: the subject from the URL until the comparison loads, then its real name, details and champions. */
function heroSides(
  kind: CompareKind,
  a: string | null,
  b: string | null,
  data: CompareData | null,
): { a: HeroSide | null; b: HeroSide | null } {
  if (kind === 'regions') {
    const d = data as CompareRegionsResponse | null
    const one = (page: string | null, side: CompareRegionsResponse['a'] | undefined): HeroSide | null => {
      if (!page) return null
      const name = side?.region.name ?? page.toUpperCase()
      return {
        page,
        name,
        detail: side?.region.area ?? areaOf(page),
        image: (
          <span className="rmark" aria-hidden="true">
            {name}
          </span>
        ),
        to: `/teams?league=${encodeURIComponent(name)}`,
        picks: side?.picks,
      }
    }
    return { a: one(a, d?.a), b: one(b, d?.b) }
  }
  if (kind === 'players') {
    const d = data as ComparePlayersResponse | null
    const one = (page: string | null, side: ComparePlayersResponse['a'] | undefined): HeroSide | null => {
      if (!page) return null
      const name = side?.player.displayName ?? page
      return {
        page,
        name,
        detail: side ? [side.player.role, side.player.team].filter(Boolean).join(' · ') : '',
        image: <PlayerPhoto page={page} name={name} role={side?.player.role} size={72} />,
        to: `/players/${encodeURIComponent(page)}`,
        picks: side?.champions,
      }
    }
    return { a: one(a, d?.a), b: one(b, d?.b) }
  }
  const d = data as CompareTeamsResponse | null
  const one = (page: string | null, side: CompareTeamsResponse['a'] | undefined): HeroSide | null => {
    if (!page) return null
    const name = side?.team.name ?? page
    return {
      page,
      name,
      detail: side?.team.league ?? '',
      image: <TeamLogo name={name} size={72} />,
      to: `/teams/${encodeURIComponent(page)}`,
      picks: side?.picks,
    }
  }
  return { a: one(a, d?.a), b: one(b, d?.b) }
}

function ChampionPools({ data, names }: { data: ComparePlayersResponse; names: [string, string] }) {
  const inA = new Set(data.a.champions.map((c) => c.champion))
  const inB = new Set(data.b.champions.map((c) => c.champion))
  const side = (champions: ChampionRow[], name: string, theirs: Set<string>) => (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title">{name}</h3>
        <span className="panel__note">Top {champions.length} by games</span>
      </div>
      {champions.length === 0 ? (
        <p className="cmp-none">No games in this range.</p>
      ) : (
        <ul className="cmp-list">
          {champions.map((c) => (
            <li key={c.champion} className={`cmp-list__row${c.underMinSample ? ' is-dim' : ''}`}>
              <ChampionIcon name={c.champion} size={28} />
              <Link to={`/champions/${encodeURIComponent(c.champion)}`} className="pool__link">
                {c.champion}
              </Link>
              {theirs.has(c.champion) && <span className="tag tag--small">Both play</span>}
              <span className="cmp-list__stat">
                {c.games} {c.games === 1 ? 'game' : 'games'} · {percent(c.winRate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div className="panels">
      {side(data.a.champions, names[0], inB)}
      {side(data.b.champions, names[1], inA)}
    </div>
  )
}

function LineupRows({ players }: { players: CompareTeamSide['players'] }) {
  return (
    <ul className="cmp-list">
      {players.map((p) => (
        <li key={p.page} className={`cmp-list__row${p.underMinSample ? ' is-dim' : ''}`}>
          <PlayerPhoto page={p.page} name={p.name} role={p.role} size={28} />
          <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link">
            {p.name}
          </Link>
          {p.role ? <span className="pool__role">{p.role}</span> : null}
          <span className="cmp-list__stat">
            {p.games} {p.games === 1 ? 'game' : 'games'} · {percent(p.winRate)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The roster the team used at the end of the range, then the others who played for it in the range. */
function Lineups({ data }: { data: CompareTeamsResponse }) {
  const side = (s: CompareTeamSide, key: string) => {
    const roster = s.players.filter((p) => p.current)
    const former = s.players.filter((p) => !p.current)
    // "Current" only when the range reaches the team's latest event; narrowed to an earlier range it is the roster of that time.
    const rosterTitle = s.rosterEvent && !s.rosterEvent.isLatest ? `Roster at ${s.rosterEvent.name}` : 'Current roster'
    return (
      <div className="panel">
        <div className="panel__head">
          <h3 className="panel__title">{s.team.name}</h3>
          <span className="panel__note">{s.players.length} players used</span>
        </div>
        {s.players.length === 0 ? (
          <p className="cmp-none">No games in this range.</p>
        ) : (
          <>
            <h4 className="cmp-group" id={`${key}-roster`}>
              {rosterTitle}
            </h4>
            <div role="group" aria-labelledby={`${key}-roster`}>
              <LineupRows players={roster} />
            </div>
            {former.length > 0 && (
              <>
                <h4 className="cmp-group" id={`${key}-former`}>
                  Former players
                </h4>
                <div role="group" aria-labelledby={`${key}-former`}>
                  <LineupRows players={former} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    )
  }
  return (
    <div className="panels">
      {side(data.a, 'cmp-a')}
      {side(data.b, 'cmp-b')}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      <span className="tile__sub">{sub}</span>
    </div>
  )
}

const record = (wins: number, losses: number) => `${wins}-${losses}`

function NeverMet({ range, onAllTime, text = 'They didn’t face each other in this range.' }: { range: CompareRange; onAllTime: () => void; text?: string }) {
  return (
    <div className="cmp-never">
      <p className="section__note">{text}</p>
      {range.label !== 'All time' && (
        <button type="button" className="btn-reset btn-reset--inline" onClick={onAllTime}>
          Look at all time
        </button>
      )}
    </div>
  )
}

function PlayerH2H({ h, a, range, onAllTime }: { h: PlayerHeadToHead; a: string; range: CompareRange; onAllTime: () => void }) {
  const none = h.games === 0 && h.togetherGames === 0
  return (
    <>
      <div className="cmp-tiles">
        <Tile
          label="Against each other"
          value={record(h.wins, h.losses)}
          sub={h.games ? `${a}’s record over ${h.games} ${h.games === 1 ? 'game' : 'games'}` : 'No games on opposite teams'}
        />
        <Tile
          label="In the same lane"
          value={record(h.laneWins, h.laneGames - h.laneWins)}
          sub={h.laneGames ? `${a}’s record, same role` : h.games ? 'They played different roles' : 'No lane games'}
        />
        <Tile
          label="As teammates"
          value={record(h.togetherWins, h.togetherGames - h.togetherWins)}
          sub={h.togetherGames ? `Team record in ${h.togetherGames} ${h.togetherGames === 1 ? 'game' : 'games'}` : 'Never on the same team'}
        />
      </div>
      {none && <NeverMet range={range} onAllTime={onAllTime} />}
    </>
  )
}

const meetingDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date TBD'

function TeamH2H({ h, a, range, onAllTime }: { h: TeamHeadToHead; a: string; range: CompareRange; onAllTime: () => void }) {
  return (
    <>
      <div className="cmp-tiles cmp-tiles--two">
        <Tile
          label="Game record"
          value={record(h.wins, h.losses)}
          sub={h.games ? `${a}’s record over ${h.games} ${h.games === 1 ? 'game' : 'games'}` : 'No games played'}
        />
        <Tile
          label="Series record"
          value={record(h.seriesWins, h.seriesLosses)}
          sub={h.seriesPlayed ? `${a}’s record over ${h.seriesPlayed} series` : 'No finished series'}
        />
      </div>
      {h.games === 0 && <NeverMet range={range} onAllTime={onAllTime} />}
      {h.recent.length > 0 && (
        <div className="panel">
          <div className="panel__head">
            <h3 className="panel__title">Recent meetings</h3>
            <span className="panel__note">Most recent first</span>
          </div>
          <ul className="cmp-list">
            {h.recent.map((m, i) => (
              <li key={i} className="cmp-list__row cmp-list__row--meeting">
                <span>{meetingDate(m.playedAt)}</span>
                <span className="cmp-list__event">{m.tournament}</span>
                <span className="cmp-list__stat">{m.winner ? `${m.winner} won` : 'No result'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function RegionTeams({ data }: { data: CompareRegionsResponse }) {
  const side = (s: CompareRegionsResponse['a']) => (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title">{s.region.name}</h3>
        <span className="panel__note">
          {s.teams.length} {s.teams.length === 1 ? 'team' : 'teams'}
        </span>
      </div>
      {s.teams.length === 0 ? (
        <p className="cmp-none">No games in this range.</p>
      ) : (
        <ul className="cmp-list">
          {s.teams.map((t) => (
            <li key={t.team} className={`cmp-list__row${t.underMinSample ? ' is-dim' : ''}`}>
              <TeamLogo name={t.team} size={28} />
              <Link to={`/teams/${encodeURIComponent(t.team)}`} className="pool__link">
                {t.team}
              </Link>
              <span className="cmp-list__stat">
                {t.games} {t.games === 1 ? 'game' : 'games'} · {percent(t.winRate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <>
      <div className="panels">
        {side(data.a)}
        {side(data.b)}
      </div>
      <p className="section__note">
        A team counts for the league it played in that year. Teams with no domestic games that year (wildcards, untracked leagues) are left out. LCP includes PCS, VCS and LJL before 2025.
      </p>
    </>
  )
}

const Chevron = (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
    <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function RegionH2H({ h, a, b, range, onAllTime }: { h: RegionHeadToHead; a: string; b: string; range: CompareRange; onAllTime: () => void }) {
  // Present once a series has been opened; the value is whether it is open now. Opened drafts stay mounted, hidden, once fetched.
  const [opened, setOpened] = useState<Record<number, boolean>>({})
  return (
    <>
      <div className="cmp-tiles">
        <Tile label="Game record" value={record(h.wins, h.losses)} sub={h.games ? `${a}’s record over ${h.games} ${h.games === 1 ? 'game' : 'games'}` : 'No games played'} />
        <Tile label="Series record" value={record(h.seriesWins, h.seriesLosses)} sub={h.seriesPlayed ? `${a}’s record over ${h.seriesPlayed} series` : 'No finished series'} />
        <Tile label="Average game" value={duration(h.avgGameLengthSec)} sub="Across all their games" />
      </div>
      {h.games === 0 && <NeverMet range={range} onAllTime={onAllTime} text={`${a} and ${b} teams didn’t meet in this range.`} />}
      {h.recent.length > 0 && (
        <div className="panel">
          <div className="panel__head">
            <h3 className="panel__title">Recent meetings</h3>
            <span className="panel__note">Most recent first · score from {a}’s side</span>
          </div>
          <ul className="cmp-list">
            {h.recent.map((m) => {
              const open = opened[m.seriesId] === true
              const detailId = `cmp-series-${m.seriesId}`
              return (
                <Fragment key={m.seriesId}>
                  <li className="cmp-list__row cmp-list__row--meeting">
                    <button
                      type="button"
                      className="row-toggle"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={`Games: ${m.teamA} vs ${m.teamB}`}
                      onClick={() => setOpened((o) => ({ ...o, [m.seriesId]: !o[m.seriesId] }))}
                    >
                      {Chevron}
                    </button>
                    <span>{meetingDate(m.playedAt)}</span>
                    <Link to={tournamentPath({ slug: m.tournamentSlug, id: m.tournamentId })} className="pool__link cmp-list__event">
                      {m.tournament}
                    </Link>
                    <span className="cmp-list__stat cmp-meeting__match">
                      <Link to={`/teams/${encodeURIComponent(m.teamA)}`} className={`pool__link${m.winner === 'a' ? ' series__winner' : ''}`}>
                        {m.teamA}
                      </Link>
                      <span className="series__vs"> {m.score ?? 'vs'} </span>
                      <Link to={`/teams/${encodeURIComponent(m.teamB)}`} className={`pool__link${m.winner === 'b' ? ' series__winner' : ''}`}>
                        {m.teamB}
                      </Link>
                    </span>
                  </li>
                  {m.seriesId in opened && (
                    <li id={detailId} className="cmp-meeting__games" hidden={!open}>
                      <SeriesGames path={`/api/tournaments/${encodeURIComponent(m.tournamentSlug)}/series/${m.seriesId}`} />
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

/** Placeholder with the real layout's rows so nothing jumps when the numbers arrive. */
function CompareSkeleton() {
  return (
    <div className="cmp-skeleton" aria-busy="true" aria-label="Loading comparison">
      <div className="skeleton" style={{ width: 280, height: 18 }} />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 44 }} />
      ))}
    </div>
  )
}
