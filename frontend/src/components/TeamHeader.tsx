import type { CSSProperties } from 'react'
import type { ContextMatch, TeamPick, TeamResponse } from '../api/types'
import { NA, percent } from '../lib/format'
import { ChampionPicker, StageBackdrop, StageMotion, stageClass, useChampionStage } from './ChampionStage'
import { TeamLogo } from './Images'
import { CountUp, Letters, SeriesStrip } from './StageBits'

const whole = (v: number | null) => (v == null ? NA : String(Math.round(v)))
const rise = (n: number) => ({ ['--i' as string]: n }) as CSSProperties

export default function TeamHeader({ data, picks, results }: { data: TeamResponse; picks?: TeamPick[]; results?: ContextMatch[] }) {
  const { team, range } = data
  const stage = useChampionStage(picks)
  const run = stage.entered

  return (
    <StageMotion>
      <section ref={stage.headerRef} className={stageClass(stage)} style={{ '--rc': stage.accent } as CSSProperties}>
        <StageBackdrop stage={stage} />
        <div className="container hero__inner">
          <div className="hero__main">
            <div className="hero__who">
              <div className="hero-img rise" style={rise(0)}>
                <TeamLogo name={team.name} size={128} />
              </div>
              <div className="hero__text">
                <div className="tags rise" style={rise(1)}>
                  {team.league && <span className="tag tag--accent">{team.league}</span>}
                  {team.region && <span className="tag">{team.region}</span>}
                </div>
                <h1 className="hero__name hero__name--team">
                  <Letters text={team.name} />
                </h1>
                {data.summary && (
                  <>
                    <dl className="form rise" style={rise(4)}>
                      <div className="form__stat">
                        <dd className="form__value">
                          <CountUp value={data.summary.wins} format={whole} run={run} />
                          {'-'}
                          <CountUp value={data.summary.losses} format={whole} run={run} />
                        </dd>
                        <dt className="form__label">Game record</dt>
                      </div>
                      <div className="form__stat">
                        <dd className="form__value">
                          <CountUp value={data.summary.winRate} format={(v) => percent(v)} run={run} />
                        </dd>
                        <dt className="form__label">Win rate</dt>
                      </div>
                    </dl>
                    <SeriesStrip results={results} />
                  </>
                )}
              </div>
            </div>
            <div className="showing rise" style={rise(7)}>
              <span className="showing__eyebrow">Showing</span>
              <span className="showing__label">{range.label}</span>
              <span className="showing__desc">{range.description}</span>
            </div>
          </div>
          <ChampionPicker stage={stage} ariaLabel="Most-picked champions" />
        </div>
      </section>
    </StageMotion>
  )
}

export function TeamHeaderSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-busy="true">
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
