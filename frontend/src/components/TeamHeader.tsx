import type { CSSProperties } from 'react'
import type { TeamPick, TeamResponse } from '../api/types'
import { percent } from '../lib/format'
import { ChampionCard, StageBackdrop, StageMotion, stageClass, useChampionStage } from './ChampionStage'
import { TeamLogo } from './Images'

export default function TeamHeader({ data, picks }: { data: TeamResponse; picks?: TeamPick[] }) {
  const { team, range } = data
  const stage = useChampionStage(picks)

  return (
    <StageMotion>
      <section className={stageClass(stage)} style={{ '--rc': stage.accent } as CSSProperties}>
        <StageBackdrop stage={stage} />
        <div className="container hero__inner">
          <div className="hero__main">
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
                {data.summary && (
                  <dl className="form">
                    <div className="form__stat">
                      <dd className="form__value">{`${data.summary.wins}-${data.summary.losses}`}</dd>
                      <dt className="form__label">Game record</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">{percent(data.summary.winRate)}</dd>
                      <dt className="form__label">Win rate</dt>
                    </div>
                  </dl>
                )}
              </div>
            </div>
            <div className="showing">
              <span className="showing__eyebrow">Showing</span>
              <span className="showing__label">{range.label}</span>
              <span className="showing__desc">{range.description}</span>
            </div>
          </div>
          <ChampionCard stage={stage} label="Signature picks" ariaLabel="Most-picked champions" />
        </div>
      </section>
    </StageMotion>
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
