import { useId, useRef, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type {
  MatchesResponse,
  RostersResponse,
  StagesResponse,
  StandingRow,
  TournamentChampion,
  TournamentContextResponse,
  TournamentPlayer,
  TournamentResponse,
} from '../api/types'
import { useApi } from '../api/useApi'
import {
  ResultsTable,
  StandingsTable,
  TournamentChampionsTable,
  TournamentChampionTiles,
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
import ErrorState from '../components/ErrorState'
import ResultsFilters from '../components/ResultsFilters'
import TournamentRosters, { TournamentRostersSkeleton } from '../components/TournamentRosters'
import TournamentStages from '../components/TournamentStages'

/** Results shown before "Show all results" is pressed; the API's own cap (200) is how many "all" can be. */
const RESULTS_PREVIEW = 20

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
  const champions = useApi<{ empty: boolean; champions: TournamentChampion[] }>(`${base}/champions`)
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
  const results = matches.data?.results ?? []
  const upcoming = matches.data?.upcoming ?? []

  // The team filter lives in the URL (?team=) and works on the lists already fetched: an event has at most a few hundred
  // series. A name that is not in the lists (an old link) is ignored.
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
        {data?.empty ? (
          <div className="empty" role="status">
            <h2 className="empty__title">No games recorded</h2>
            <p className="empty__text">This event has no games in our data yet.</p>
          </div>
        ) : (
          <>
            {stages.data && !stages.data.empty && (stages.data.stages.length > 1 || stages.data.stages[0].key === 'knockout') && (
              <TournamentStages stages={stages.data.stages} />
            )}

            <section aria-labelledby="records" className="section">
              <h2 id="records" className="section__title">
                Standings and results
              </h2>
              <div className="duo duo--flip duo--records">
                <div className="section">
                  <h3 className="ctx__sub">Team records (series record first, then game difference)</h3>
                  {standings.data ? <StandingsTable standings={standings.data.standings} onTeam={showTeamMatches} /> : <Skeleton />}
                </div>
                <div className="section" ref={matchesRef}>
                  <div className="matches__head">
                    <h3 className="ctx__sub">Matches (newest first)</h3>
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
                        results.length === 0 && !filtering ? (
                          <p className="matches__note">No results yet.</p>
                        ) : filtering && matchedUpcoming.length + matchedResults.length === 0 ? (
                          <p className="matches__note">No matches for this team.</p>
                        ) : (
                          <>
                            {filtering && matchedUpcoming.length > 0 && (
                              <>
                                <h4 className="matches__group">Upcoming</h4>
                                <UpcomingTable upcoming={matchedUpcoming} />
                              </>
                            )}
                            {filtering && matchedUpcoming.length > 0 && matchedResults.length > 0 && <h4 className="matches__group">Played</h4>}
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
                <span className="section__note">Presence is the share of games where it was picked or banned</span>
              </div>
              {champions.data ? (
                <>
                  <TournamentChampionTiles champions={champions.data.champions.slice(0, 8)} />
                  {champions.data.champions.length > 8 && (
                    <details className="more">
                      <summary>All {champions.data.champions.length} champions</summary>
                      <TournamentChampionsTable champions={champions.data.champions} />
                    </details>
                  )}
                </>
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
