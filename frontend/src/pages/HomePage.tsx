import { Link } from 'react-router-dom'
import type { RecentTournamentsResponse } from '../api/types'
import { useApi } from '../api/useApi'
import SearchBox from '../components/SearchBox'
import { dateRange } from '../lib/format'

export default function HomePage() {
  const recent = useApi<RecentTournamentsResponse>('/api/tournaments/recent?limit=5')

  return (
    <main className="main container home">
      <section className="home__hero">
        <div className="home__scope">
          <span className="home__badge">Tier 1 + Internationals</span>
          <span className="home__leagues">LCK · LPL · LEC · LCS · CBLOL · LCP · Worlds · MSI</span>
        </div>
        <h1 className="home__headline">
          Every pro game.
          <br />
          Every stat.
          <br />
          One search.
        </h1>
        <SearchBox />
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="section__head home__recent-head">
          <h2 className="section__title home__section-title" id="recent-title">Recent tournaments</h2>
          <Link to="/tournaments" className="home__all">All tournaments →</Link>
        </div>
        {recent.error ? (
          <div className="empty" role="alert">
            <h3 className="empty__title">Couldn’t load tournaments</h3>
            <p className="empty__text">{recent.error.message}. Try again in a moment.</p>
          </div>
        ) : (
          <div className="cards" aria-busy={recent.loading}>
            {recent.data
              ? recent.data.tournaments.map((t) => (
                  <Link key={t.id} to={`/tournaments/${t.id}`} className="card">
                    <div className="card__top">
                      <span className="tag">{t.league}</span>
                      <span className={`badge${t.status === 'In progress' ? ' badge--live' : ''}`}>{t.status}</span>
                    </div>
                    <h3 className="card__name">{t.name}</h3>
                    <p className="card__dates">{dateRange(t.startDate, t.endDate)}</p>
                    <div className="card__foot">
                      <span className="card__foot-label">{t.standingLabel ?? ' '}</span>
                      <span className="card__foot-value">{t.standingTeam ?? ' '}</span>
                    </div>
                  </Link>
                ))
              : Array.from({ length: 5 }, (_, i) => <div key={i} className="card skeleton" style={{ height: 262 }} />)}
          </div>
        )}
      </section>
    </main>
  )
}
