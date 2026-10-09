import type { PlayerResponse } from '../api/types'
import { PlayerPhoto } from './Images'

export default function PlayerHeader({ data }: { data: PlayerResponse }) {
  const { player, range } = data
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="hero-img">
            <PlayerPhoto page={player.name} name={player.displayName} size={128} />
          </div>
          <div className="hero__text">
            <div className="tags">
              {player.role && <span className="tag tag--gold">{player.role}</span>}
              {player.league && <span className="tag">{player.league}</span>}
            </div>
            <h1 className="hero__name">{player.displayName}</h1>
            {player.team && <span className="hero__team">{player.team}</span>}
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
