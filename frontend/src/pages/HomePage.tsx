import { Link } from 'react-router-dom'
import type { ChampionListRow, ListResponse, RecentTournamentsResponse } from '../api/types'
import { useApi } from '../api/useApi'
import SearchBox from '../components/SearchBox'
import HeroShow from '../components/HeroShow'
import { ChampionStrip, TopPlayers, TournamentRows, TournamentRowsSkeleton } from '../components/HomeParts'
import ErrorState from '../components/ErrorState'
import { usePageTitle } from '../lib/usePageTitle'

export default function HomePage() {
  const recent = useApi<RecentTournamentsResponse>('/api/tournaments/recent?limit=5')
  // One request feeds both the hero slideshow and the champion strip.
  const champions = useApi<ListResponse<ChampionListRow>>('/api/champions?pageSize=8&sort=presence')
  usePageTitle(null)

  return (
    <main className="main home home--hero">
      <HeroShow champions={champions.data?.rows} settled={!champions.loading}>
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
      </HeroShow>

      <div className="container home__body">
        <div className="home__split">
          <TopPlayers />
          <section aria-labelledby="recent-title">
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
        </div>

        <ChampionStrip list={champions} />
      </div>
    </main>
  )
}
