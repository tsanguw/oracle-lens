import { useId, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type {
  MatchesResponse,
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
} from '../components/TournamentParts'
import { usePageMeta, useJsonLd } from '../lib/usePageMeta'
import { notFoundSeo, tournamentLd, tournamentSeo } from '../lib/seoText'
import ErrorState from '../components/ErrorState'
import TournamentStages from '../components/TournamentStages'

/** Results shown before "Show all results" is pressed; the API's own cap (200) is how many "all" can be. */
const RESULTS_PREVIEW = 20

const Skeleton = () => <div className="skeleton" style={{ height: 240 }} aria-busy="true" />

export default function TournamentPage({ id }: { id: string }) {
  const [showAll, setShowAll] = useState(false)
  const resultsId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const base = `/api/tournaments/${encodeURIComponent(id)}`

  const tournament = useApi<TournamentResponse>(base)
  const standings = useApi<{ empty: boolean; standings: StandingRow[] }>(`${base}/standings`)
  const matches = useApi<MatchesResponse>(`${base}/matches?limit=200`)
  const players = useApi<{ empty: boolean; minGames: number; players: TournamentPlayer[] }>(`${base}/players`)
  const champions = useApi<{ empty: boolean; champions: TournamentChampion[] }>(`${base}/champions`)
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
  // A play-in's address opens its competition ("Worlds 2025 Play-In" is part of "Worlds 2025"): move to that address.
  if (tournament.data && String(tournament.data.tournament.id) !== id) {
    return <Navigate to={`/tournaments/${tournament.data.tournament.id}`} replace />
  }

  const data = tournament.data
  const results = matches.data?.results ?? []
  // The longer list is fetched once and sliced here, so the button works both ways at once, with no reload and no
  // flicker, and stays the same element (it keeps keyboard focus).
  const visibleResults = showAll ? results : results.slice(0, RESULTS_PREVIEW)
  const canToggleResults = results.length > RESULTS_PREVIEW
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
              <div className="duo duo--flip">
                <div className="section">
                  <h3 className="ctx__sub">Team records (series record first, then game difference)</h3>
                  {standings.data ? <StandingsTable standings={standings.data.standings} /> : <Skeleton />}
                </div>
                <div className="section">
                  <h3 className="ctx__sub">Results (newest first)</h3>
                  {matches.data ? (
                    results.length === 0 ? (
                      <p className="section__note">No results yet.</p>
                    ) : (
                      <>
                        <div id={resultsId}>
                          <ResultsTable results={visibleResults} />
                        </div>
                        {canToggleResults && (
                          <button
                            ref={toggleRef}
                            type="button"
                            className="btn-reset btn-reset--inline"
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
            </section>

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
