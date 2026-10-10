import { Link } from 'react-router-dom'
import type { PlayerResponse } from '../api/types'
import { decimal, percent, rate } from '../lib/format'
import { PlayerPhoto, TeamLogo } from './Images'

export default function PlayerHeader({ data }: { data: PlayerResponse }) {
  const { player, range, summary } = data
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="hero-img">
            <PlayerPhoto page={player.name} name={player.displayName} role={player.role} size={128} />
          </div>
          <div className="hero__text">
            <div className="tags">
              {player.role && <span className="tag tag--gold">{player.role}</span>}
              {player.league && <span className="tag">{player.league}</span>}
            </div>
            <h1 className="hero__name">{player.displayName}</h1>
            {player.team && (
              <Link to={`/teams/${encodeURIComponent(player.team)}`} className="hero__team with-img">
                <TeamLogo name={player.team} size={22} />
                {player.team}
              </Link>
            )}
            {summary && (
              <>
                <dl className="form">
                  <div className="form__stat">
                    <dd className="form__value">{percent(summary.winRate)}</dd>
                    <dt className="form__label">Win rate</dt>
                  </div>
                  <div className="form__stat">
                    <dd className="form__value">{decimal(summary.kda)}</dd>
                    <dt className="form__label">KDA</dt>
                  </div>
                  <div className="form__stat">
                    <dd className="form__value">{summary.games}</dd>
                    <dt className="form__label">Games</dt>
                  </div>
                </dl>
                <p className="form__note">
                  Blue side {percent(rate(summary.blueWins, summary.blueGames))}, red side {percent(rate(summary.redWins, summary.redGames))}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="showing">
          <span className="showing__eyebrow">Showing</span>
          <span className="showing__label">{range.label}</span>
          <span className="showing__desc">{range.description}</span>
        </div>
      </div>
    </section>
  )
}

export function PlayerHeaderSkeleton() {
  return (
    <section className="hero" aria-busy="true">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="photo skeleton" />
          <div className="hero__text">
            <div className="skeleton" style={{ width: 120, height: 22 }} />
            <div className="skeleton" style={{ width: 300, height: 70 }} />
            <div className="skeleton" style={{ width: 160, height: 20 }} />
          </div>
        </div>
      </div>
    </section>
  )
}
