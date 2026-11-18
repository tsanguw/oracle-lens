import { useId, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type {
  MatchesResponse,
  RostersResponse,
  SeriesRow,
  StagesResponse,
  StandingRow,
  TournamentChampion,
  TournamentChampionDetailResponse,
  TournamentContextResponse,
  TournamentPlayer,
  TournamentResponse,
  TournamentStage,
} from '../api/types'
import { useApi } from '../api/useApi'
import {
  ResultsTable,
  StandingsTable,
  TournamentChampionDetailPanel,
  TournamentContext,
  TournamentHeader,
  TournamentHeaderSkeleton,
  TournamentPlayerCards,
  TournamentPlayersTable,
  UpcomingTable,
} from '../components/TournamentParts'
import { usePageMeta, useJsonLd } from '../lib/usePageMeta'
import { notFoundSeo, tournamentLd, tournamentSeo } from '../lib/seoText'
import { tournamentPath } from '../lib/tournamentPath'
import { filterMatches, teamOptions } from '../lib/matchFilter'
import ChampionSelect from '../components/ChampionSelect'
import TournamentChampionTable from '../components/TournamentChampionTable'
import ErrorState from '../components/ErrorState'
import { TeamLogo } from '../components/Images'
import ResultsFilters from '../components/ResultsFilters'
import TournamentRosters, { TournamentRostersSkeleton } from '../components/TournamentRosters'
import TournamentStages from '../components/TournamentStages'

/** Results shown before "Show all results" is pressed; the API's own cap (200) is how many "all" can be. */
const RESULTS_PREVIEW = 20

/** Champions the hero strip draws from: the top of the list, as before the champions table showed them all. */
const TOP_CHAMPIONS = 15

const Skeleton = () => (
  <div className="skeleton" style={{ height: 240 }} role="status" aria-busy="true">
    <span className="sr-only">Loading…</span>
  </div>
)

export default function TournamentPage({ id }: { id: string }) {
  const [showAll, setShowAll] = useState(false)
  const resultsId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const matchesRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const base = `/api/tournaments/${encodeURIComponent(id)}`

  const tournament = useApi<TournamentResponse>(base)
  const standings = useApi<{ empty: boolean; standings: StandingRow[] }>(`${base}/standings`)
  const matches = useApi<MatchesResponse>(`${base}/matches?limit=200`)
  const players = useApi<{ empty: boolean; minGames: number; players: TournamentPlayer[] }>(`${base}/players`)
  // Every champion of the event (the API caps a list at 200, and an event has well under that): the table and the
  // dropdown use all of them, the hero strip only the top 15, as before.
  const allChampions = useApi<{ empty: boolean; champions: TournamentChampion[] }>(`${base}/champions?limit=200`)
  const champions = {
    ...allChampions,
    data: allChampions.data && { ...allChampions.data, champions: allChampions.data.champions.slice(0, TOP_CHAMPIONS) },
  }
  // The champion search lives in the URL (?champion=). A name that is not one of the event's champions (an old link) is
  // ignored, and so is the whole choice while the list is still loading.
  // The dropdown lists every champion, so a champion the event never used can be chosen too (its panel says so).
  const championNames = useApi<{ names: string[] }>('/api/filters/champions')
  const inEvent = new Set(allChampions.data?.champions.map((c) => c.champion))
  const champion = [...inEvent, ...(championNames.data?.names ?? [])].find((name) => name === params.get('champion')) ?? ''
  const championDetail = useApi<TournamentChampionDetailResponse>(champion ? `${base}/champions/${encodeURIComponent(champion)}` : null)
  const setChampion = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('champion', value)
    else next.delete('champion')
    setParams(next, { replace: true })
  }
  const rosters = useApi<RostersResponse>(`${base}/rosters`)
  const context = useApi<TournamentContextResponse>(`${base}/context`)
  const stages = useApi<StagesResponse>(`${base}/stages`)
  const missing = tournament.error?.status === 404
  usePageMeta({ ...(missing ? notFoundSeo('Tournament') : tournamentSeo(tournament.data)), noindex: missing })
  useJsonLd(tournamentLd(tournament.data))

  if (tournament.error?.status === 404) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Tournament not found</h1>
          <p className="empty__text">We don’t have a tournament with that id.</p>
        </div>
      </main>
    )
  }
  if (tournament.error) {
    return (
      <main className="main container">
        <ErrorState message={tournament.error.message} onRetry={tournament.reload} level={1} />
      </main>
    )
  }
  // Move to the readable address: an old numeric id, a play-in's id (it is part of its competition) or another letter case
  // all open the page, and this puts the competition's own slug in the address bar.
  if (tournament.data?.tournament.slug && tournament.data.tournament.slug !== id) {
    return <Navigate to={`${tournamentPath(tournament.data.tournament)}${search}`} replace />
  }

  const data = tournament.data
  // An event with no games that has not ended yet (scheduled, or started without a game loaded): its schedule, bracket
  // and teams take the place of the stats. A past event with no games keeps the "No games recorded" note.
  const notStarted = data?.empty === true && data.tournament.status !== 'Completed'

  // The server says which stage the page opens on (the last one with a result), or null when it shows no stages: a
  // single group stage is already the standings table. The chosen stage lives in the URL (?stage=); an unknown one (an
  // old link) falls back to the default.
  const defaultKey = stages.data?.defaultKey ?? null
  const stageList = stages.data && defaultKey ? stages.data.stages : null
  const selected = stageList?.find((s) => s.key === params.get('stage')) ?? stageList?.find((s) => s.key === defaultKey) ?? null
  const setStage = (key: TournamentStage['key']) => {
    const next = new URLSearchParams(params)
    if (key === defaultKey) next.delete('stage')
    else next.set('stage', key)
    setParams(next, { replace: true })
  }
  // With stages, "Standings and results" is about the chosen one: its own records and only its series. An event that has
  // not started lists its whole schedule instead.
  const stage = notStarted ? null : selected
  const stageSeries = new Set(stage?.rounds.flatMap((r) => r.series.map((s) => s.seriesId)) ?? [])
  const inStage = (rows: SeriesRow[]) => (stage ? rows.filter((s) => stageSeries.has(s.seriesId)) : rows)
  const results = inStage(matches.data?.results ?? [])
  const upcoming = inStage(matches.data?.upcoming ?? [])
  // Until the stages are known the page cannot tell whose records to show, so the table waits for them.
  const records = stage ? stage.records : stages.data || stages.error ? standings.data?.standings : undefined

  // The team filter lives in the URL (?team=) and works on the lists already fetched: an event has at most a few hundred
  // series. A name that is not in the lists (an old link, or a team not in the chosen stage) is ignored.
  const teams = teamOptions(upcoming, results)
  const team = teams.includes(params.get('team') ?? '') ? (params.get('team') ?? '') : ''
  const filtering = team !== ''
  const matchedUpcoming = filterMatches(upcoming, team || null)
  const matchedResults = filterMatches(results, team || null)
  const setTeam = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('team', value)
    else next.delete('team')
    next.delete('date')
    setParams(next, { replace: true })
  }
  // A team's calendar icon in the standings: filter to that team and, where the match list is below the standings
  // (narrow screens), bring it into view.
  const showTeamMatches = (name: string) => {
    setTeam(name)
    if (window.matchMedia('(max-width: 1100px)').matches) {
      requestAnimationFrame(() => matchesRef.current?.scrollIntoView({ block: 'start' }))
    }
  }

  // The longer list is fetched once and sliced here, so the button works both ways at once, with no reload and no
  // flicker, and stays the same element (it keeps keyboard focus). A filter shows every match it finds.
  const visibleResults = filtering || showAll ? matchedResults : results.slice(0, RESULTS_PREVIEW)
  const canToggleResults = !filtering && results.length > RESULTS_PREVIEW
  // A team filter or a stage puts the unplayed series in the list too, above the played ones; a stage that has not
  // started has nothing else to show.
  const showUpcoming = (filtering || stage !== null) && matchedUpcoming.length > 0
  const toggleResults = () => {
    const collapsing = showAll
    setShowAll(!showAll)
    // Collapsing a long list moves the button up the page; bring it back into view if it was left off screen.
    if (collapsing) requestAnimationFrame(() => toggleRef.current?.scrollIntoView({ block: 'nearest' }))
  }

  return (
    <>
      {data ? <TournamentHeader data={data} champions={champions.data?.champions} /> : <TournamentHeaderSkeleton />}
      <TournamentContext data={context.data} />
      <main className="main container">
        {notStarted ? (
          <>
            {stageList && selected && <TournamentStages stages={stageList} activeKey={selected.key} onSelect={setStage} />}

            <section aria-labelledby="schedule" className="section schedule">
              <div className="matches__head">
                <h2 id="schedule" className="section__title">
                  Schedule
                </h2>
                {upcoming.length > 0 && (
                  <ResultsFilters teams={teams} team={team} onChange={setTeam} shown={matchedUpcoming.length} total={upcoming.length} />
                )}
              </div>
              {matches.data ? (
                upcoming.length === 0 ? (
                  <p className="matches__note">No matches have been scheduled yet.</p>
                ) : matchedUpcoming.length === 0 ? (
                  <p className="matches__note">No matches for this team.</p>
                ) : (
                  <UpcomingTable upcoming={matchedUpcoming} />
                )
              ) : (
                <Skeleton />
              )}
            </section>

            {teams.length > 0 && (
              <section aria-labelledby="teams" className="section">
                <div className="section__head">
                  <h2 id="teams" className="section__title">
                    Teams taking part
                  </h2>
                  <span className="section__note">From the matches scheduled so far</span>
                </div>
                <ul className="rosters">
                  {teams.map((name) => (
                    <li key={name} className="roster">
                      <h3 className="roster__team">
                        <Link to={`/teams/${encodeURIComponent(name)}`} className="roster__name with-img">
                          <TeamLogo name={name} size={32} />
                          {name}
                        </Link>
                      </h3>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : data?.empty ? (
          <div className="empty" role="status">
            <h2 className="empty__title">No games recorded</h2>
            <p className="empty__text">This event has no games in our data yet.</p>
          </div>
        ) : (
          <>
            {stageList && selected && <TournamentStages stages={stageList} activeKey={selected.key} onSelect={setStage} />}

            <section aria-labelledby="records" className="section">
              <h2 id="records" className="section__title">
                Standings and results
              </h2>
              <div className="duo duo--flip duo--records">
                <div className="section">
                  <h3 className="ctx__sub">
                    Team records{stage ? `: ${stage.label}` : ''} (series record first, then game difference)
                  </h3>
                  {records === undefined ? (
                    <Skeleton />
                  ) : records.length === 0 ? (
                    <p className="matches__note">{stage ? 'No results in this stage yet.' : 'No results yet.'}</p>
                  ) : (
                    <StandingsTable standings={records} onTeam={showTeamMatches} />
                  )}
                </div>
                <div className="section" ref={matchesRef}>
                  <div className="matches__head">
                    <h3 className="ctx__sub">Matches{stage ? `: ${stage.label}` : ''} (newest first)</h3>
                    {matches.data && upcoming.length + results.length > 0 && (
                      <ResultsFilters
                        teams={teams}
                        team={team}
                        onChange={setTeam}
                        shown={matchedUpcoming.length + matchedResults.length}
                        total={upcoming.length + results.length}
                      />
                    )}
                  </div>
                  <div className="matches">
                    <div className="matches__list">
                      {matches.data ? (
                        matchedResults.length === 0 && !showUpcoming ? (
                          <p className="matches__note">
                            {filtering ? 'No matches for this team.' : stage ? 'No matches in this stage yet.' : 'No results yet.'}
                          </p>
                        ) : (
                          <>
                            {showUpcoming && (
                              <>
                                <h4 className="matches__group">Upcoming</h4>
                                <UpcomingTable upcoming={matchedUpcoming} />
                              </>
                            )}
                            {showUpcoming && matchedResults.length > 0 && <h4 className="matches__group">Played</h4>}
                            <div id={resultsId}>{visibleResults.length > 0 && <ResultsTable results={visibleResults} base={base} />}</div>
                            {canToggleResults && (
                              <button
                                ref={toggleRef}
                                type="button"
                                className="btn-reset btn-reset--inline matches__more"
                                aria-expanded={showAll}
                                aria-controls={resultsId}
                                onClick={toggleResults}
                              >
                                {showAll ? 'Show fewer results' : 'Show all results'}
                              </button>
                            )}
                          </>
                        )
                      ) : (
                        <Skeleton />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {!rosters.data?.empty && (
              <section aria-labelledby="rosters" className="section">
                <div className="section__head">
                  <h2 id="rosters" className="section__title">
                    Rosters
                  </h2>
                  <span className="section__note">Who played for each team in this event, with games played</span>
                </div>
                {rosters.data ? <TournamentRosters data={rosters.data} /> : <TournamentRostersSkeleton />}
              </section>
            )}

            <section aria-labelledby="players" className="section">
              <div className="section__head">
                <h2 id="players" className="section__title">
                  Top players
                </h2>
                <span className="section__note">
                  {players.data && players.data.minGames < 5
                    ? 'Short event: everyone who played, ranked by KDA'
                    : 'Ranked by KDA, minimum 5 games'}
                </span>
              </div>
              {players.data ? (
                <>
                  <TournamentPlayerCards players={players.data.players.slice(0, 5)} />
                  {players.data.players.length > 5 && (
                    <details className="more">
                      <summary>All {players.data.players.length} ranked players</summary>
                      <TournamentPlayersTable players={players.data.players} />
                    </details>
                  )}
                </>
              ) : (
                <Skeleton />
              )}
            </section>

            <section aria-labelledby="champions" className="section">
              <div className="section__head">
                <h2 id="champions" className="section__title">
                  Champions
                </h2>
                <span className="section__note">Presence is the share of games where it was picked or banned. Sort by any column.</span>
                {allChampions.data && allChampions.data.champions.length > 0 && (
                  <div className="matches__tools">
                    <ChampionSelect champions={[...new Set([...inEvent, ...(championNames.data?.names ?? [])])]} inEvent={inEvent} value={champion} onChange={setChampion} />
                  </div>
                )}
              </div>
              {champion && <TournamentChampionDetailPanel name={champion} state={championDetail} />}
              {allChampions.data ? (
                allChampions.data.champions.length > 0 && <TournamentChampionTable champions={allChampions.data.champions} selected={champion} />
              ) : (
                <Skeleton />
              )}
            </section>
          </>
        )}
      </main>
    </>
  )
}
