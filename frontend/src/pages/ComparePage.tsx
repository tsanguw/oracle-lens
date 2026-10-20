import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type {
  CompareRange,
  ComparePlayersResponse,
  CompareTeamsResponse,
  FiltersResponse,
  PlayerHeadToHead,
  TeamHeadToHead,
  TeamPlayer,
  ChampionRow,
} from '../api/types'
import { useApi } from '../api/useApi'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FilterBar from '../components/FilterBar'
import { ChampionIcon, PlayerPhoto, TeamLogo } from '../components/Images'
import VersusHero, { type CompareKind, type HeroRecord, type HeroSide } from '../components/VersusHero'
import VersusTape from '../components/VersusTape'
import { percent } from '../lib/format'
import { PLAYER_ROWS, TEAM_ROWS } from '../lib/compareRows'
import { usePageMeta } from '../lib/usePageMeta'

export type { CompareKind }

const KINDS = ['players', 'teams'] as const
const KIND_LABEL: Record<CompareKind, string> = { players: 'Players', teams: 'Teams' }
/** What a visitor's range choice is made of; widening to all time drops them all. */
const RANGE_PARAMS = ['league', 'year', 'split', 'tournament', 'patch']

/** Same query string everywhere, so the shared range and filters survive picking, swapping and the way back. */
const pathFor = (kind: CompareKind, a: string | null, b: string | null, qs: string) =>
  `/compare/${kind}${a ? `/${encodeURIComponent(a)}` : ''}${a && b ? `/${encodeURIComponent(b)}` : ''}${qs}`

export default function ComparePage({ kind, a, b }: { kind: CompareKind; a: string | null; b: string | null }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const singular = kind === 'players' ? 'player' : 'team'

  // Both subjects chosen; until then nothing is fetched, not even the filter options.
  const ready = a !== null && b !== null
  const result = useApi<ComparePlayersResponse | CompareTeamsResponse>(
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
  const pick = (side: 'a' | 'b', value: string) =>
    navigate(side === 'a' || !a ? pathFor(kind, value, a ? b : null, qs) : pathFor(kind, a, value, qs))
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

        <VersusHero kind={kind} a={sides.a} b={sides.b} onPick={pick} record={record} />

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
                  : `We don’t have one of these ${kind}. Check the spelling, or search for another.`}
              </p>
            </div>
          )}

          {ready && !result.error && !data && <CompareSkeleton />}

          {data?.empty && <EmptyState onReset={reset} />}

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
                  <span className="section__note">Bars compare the two with each other. The better figure is green; games played and game length are not ranked.</span>
                </div>
                {kind === 'players' ? (
                  <VersusTape rows={PLAYER_ROWS} a={(data as ComparePlayersResponse).a.summary} b={(data as ComparePlayersResponse).b.summary} names={[nameA, nameB]} />
                ) : (
                  <VersusTape rows={TEAM_ROWS} a={(data as CompareTeamsResponse).a.summary} b={(data as CompareTeamsResponse).b.summary} names={[nameA, nameB]} />
                )}
              </section>

              <section aria-labelledby="cmp-pool" className="section">
                <h2 id="cmp-pool" className="section__title">
                  {kind === 'players' ? 'Champion pools' : 'Lineups'}
                </h2>
                {kind === 'players' ? <ChampionPools data={data as ComparePlayersResponse} names={[nameA, nameB]} /> : <Lineups data={data as CompareTeamsResponse} />}
              </section>

              <section aria-labelledby="cmp-h2h" className="section">
                <h2 id="cmp-h2h" className="section__title">
                  Head to head
                </h2>
                {kind === 'players' ? (
                  <PlayerH2H h={(data as ComparePlayersResponse).headToHead} a={nameA} onAllTime={showAllTime} range={data.range} />
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
  data: ComparePlayersResponse | CompareTeamsResponse | null,
): { a: HeroSide | null; b: HeroSide | null } {
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

function Lineups({ data }: { data: CompareTeamsResponse }) {
  const side = (name: string, players: TeamPlayer[]) => (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title">{name}</h3>
        <span className="panel__note">{players.length} players used</span>
      </div>
      {players.length === 0 ? (
        <p className="cmp-none">No games in this range.</p>
      ) : (
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
      )}
    </div>
  )
  return (
    <div className="panels">
      {side(data.a.team.name, data.a.players)}
      {side(data.b.team.name, data.b.players)}
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

function NeverMet({ range, onAllTime }: { range: CompareRange; onAllTime: () => void }) {
  return (
    <div className="cmp-never">
      <p className="section__note">They didn’t face each other in this range.</p>
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
