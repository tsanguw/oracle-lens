import { Link } from 'react-router-dom'
import type { RecentTournamentsResponse } from '../api/types'
import { useApi } from '../api/useApi'
import SearchBox from '../components/SearchBox'
import { ChampionStrip, TopPlayers, TournamentRows, TournamentRowsSkeleton } from '../components/HomeParts'
import ErrorState from '../components/ErrorState'
import { usePageTitle } from '../lib/usePageTitle'

export default function HomePage() {
  const recent = useApi<RecentTournamentsResponse>('/api/tournaments/recent?limit=5')
  usePageTitle(null)

  return (
    <main className="main container home">
      <section className="home__hero">
        <div className="home__intro">
          <h1 className="home__headline">
            Every pro game,
            <br />
            one search.
          </h1>
          <p className="home__lede">
            Stats for LCK, LPL, LEC, LCS, CBLOL and LCP, plus Worlds and MSI, back to 2011.
          </p>
          <SearchBox />
        </div>
        <TopPlayers />
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="section__head home__head">
          <h2 className="section__title home__section-title" id="recent-title">Recent tournaments</h2>
          <Link to="/tournaments" className="home__all">All tournaments →</Link>
        </div>
        {recent.error ? (
          <ErrorState message={recent.error.message} onRetry={recent.reload} heading="Couldn’t load tournaments" level={3} />
        ) : recent.data ? (
          <TournamentRows tournaments={recent.data.tournaments} />
        ) : (
          <TournamentRowsSkeleton />
        )}
      </section>

      <ChampionStrip />
    </main>
  )
}
