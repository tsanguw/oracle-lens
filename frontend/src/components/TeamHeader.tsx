import type { TeamResponse } from '../api/types'
import { TeamLogo } from './Images'

export default function TeamHeader({ data }: { data: TeamResponse }) {
  const { team, range } = data
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="hero-img">
            <TeamLogo name={team.name} size={128} />
          </div>
          <div className="hero__text">
            <div className="tags">
              {team.league && <span className="tag tag--gold">{team.league}</span>}
              {team.region && <span className="tag">{team.region}</span>}
            </div>
            <h1 className="hero__name hero__name--team">{team.name}</h1>
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

export function TeamHeaderSkeleton() {
  return (
    <section className="hero" aria-busy="true">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="photo skeleton" />
          <div className="hero__text">
            <div className="skeleton" style={{ width: 120, height: 22 }} />
            <div className="skeleton" style={{ width: 320, height: 70 }} />
          </div>
        </div>
      </div>
    </section>
  )
}
