import { Link } from 'react-router-dom'
import type { ChampionListRow, LeaderboardResponse, ListResponse, RecentTournament } from '../api/types'
import { useApi, type ApiState } from '../api/useApi'
import { dateRange, decimal, percent } from '../lib/format'
import { tournamentPath } from '../lib/tournamentPath'
import { ChampionIcon, PlayerPhoto, TeamLogo } from './Images'

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="home__inline-error" role="alert">
      Couldn’t load this right now.{' '}
      <button type="button" className="home__retry" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}

/** The six best KDAs in the default range: a live look at the data, with real photos, beside the search. */
export function TopPlayers() {
  const board = useApi<LeaderboardResponse>('/api/leaderboard/players?pageSize=6&sort=kda')
  const rows = board.data?.players ?? []
  return (
    <aside className="spot" aria-labelledby="spot-title" aria-busy={board.loading}>
      <div className="spot__head">
        <h2 className="spot__title" id="spot-title">Top players by KDA</h2>
        <p className="spot__sub">{board.data?.range.label ?? ' '}</p>
      </div>
      {board.error ? (
        <InlineError onRetry={board.reload} />
      ) : board.data ? (
        <ol className="spot__list">
          {rows.map((r, i) => (
            <li key={r.page} style={{ ['--i' as string]: i }}>
              <Link to={`/players/${encodeURIComponent(r.page)}`} className="spot__row">
                <span className={`spot__rank${i === 0 ? ' is-first' : ''}`}>{r.rank}</span>
                <PlayerPhoto page={r.page} name={r.name} role={r.role} size={44} eager />
                <span className="spot__who">
                  <span className="spot__name">{r.name}</span>
                  <span className="spot__team with-img">
                    {r.team && <TeamLogo name={r.team} size={16} />}
                    {r.team ?? r.league ?? ''}
                  </span>
                </span>
                <span className="spot__kda">{decimal(r.kda)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="spot__list" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      )}
      <Link to="/players" className="spot__more">Full leaderboard →</Link>
    </aside>
  )
}

/** Newest events as plain rows; the first is the lead and gets more room. */
export function TournamentRows({ tournaments }: { tournaments: RecentTournament[] }) {
  return (
    <ol className="trn">
      {tournaments.map((t, i) => (
        <li key={t.id} style={{ ['--i' as string]: i }}>
          <Link to={tournamentPath(t)} className={`trn__row${i === 0 ? ' trn__row--lead' : ''}`}>
            <span className="trn__tags">
              <span className="tag tag--small">{t.league}</span>
              <span className={`badge${t.status === 'In progress' ? ' badge--live' : ''}`}>{t.status}</span>
            </span>
            <span className="trn__name">{t.name}</span>
            <span className="trn__dates">{dateRange(t.startDate, t.endDate)}</span>
            <span className="trn__standing">
              <span className="trn__label">{t.standingLabel ?? ' '}</span>
              <span className="trn__team with-img">
                {t.standingTeam && <TeamLogo name={t.standingTeam} size={i === 0 ? 32 : 24} />}
                {t.standingTeam ?? ' '}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export function TournamentRowsSkeleton() {
  return (
    <div className="trn" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 96 : 64, marginBottom: 6 }} />
      ))}
    </div>
  )
}

/** The eight champions picked or banned in the most games, linking to their pages. */
export function ChampionStrip({ list }: { list: ApiState<ListResponse<ChampionListRow>> }) {
  return (
    <section className="section" aria-labelledby="champs-title">
      <div className="section__head home__head">
        <div>
          <h2 className="section__title home__section-title" id="champs-title">Most contested champions</h2>
          <p className="home__note">Picked or banned in the most games. {list.data?.range.label ?? ''}</p>
        </div>
        <Link to="/champions" className="home__all">All champions →</Link>
      </div>
      {list.error ? (
        <InlineError onRetry={list.reload} />
      ) : (
        <ul className="champs" aria-busy={list.loading}>
          {list.data
            ? list.data.rows.map((c, i) => (
                <li key={c.name} style={{ ['--i' as string]: i }}>
                  <Link to={`/champions/${encodeURIComponent(c.name)}`} className="champs__tile">
                    <ChampionIcon name={c.name} size={56} />
                    <span className="champs__name">{c.name}</span>
                    <span className="champs__stat">{percent(c.presence)} presence</span>
                  </Link>
                </li>
              ))
            : Array.from({ length: 8 }, (_, i) => <li key={i} className="skeleton" style={{ height: 120 }} />)}
        </ul>
      )}
    </section>
  )
}
