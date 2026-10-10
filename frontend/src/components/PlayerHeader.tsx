import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { ChampionRow, ContextMatch, PlayerResponse } from '../api/types'
import { decimal, NA, percent, rate } from '../lib/format'
import { ChampionPicker, StageBackdrop, StageMotion, stageClass, useChampionStage } from './ChampionStage'
import { PlayerPhoto, TeamLogo } from './Images'
import { CountUp, Letters, SeriesStrip } from './StageBits'

const whole = (v: number | null) => (v == null ? NA : String(Math.round(v)))
const rise = (n: number) => ({ ['--i' as string]: n }) as CSSProperties

export default function PlayerHeader({ data, champions, results }: { data: PlayerResponse; champions?: ChampionRow[]; results?: ContextMatch[] }) {
  const { player, range, summary } = data
  const stage = useChampionStage(champions)
  const run = stage.entered

  return (
    <StageMotion>
      <section ref={stage.headerRef} className={stageClass(stage)} style={{ '--rc': stage.accent } as CSSProperties}>
        <StageBackdrop stage={stage} />
        <div className="container hero__inner">
          <div className="hero__main">
            <div className="hero__who">
              <div className="hero-img rise" style={rise(0)}>
                <PlayerPhoto page={player.name} name={player.displayName} role={player.role} size={128} />
              </div>
              <div className="hero__text">
                <div className="tags rise" style={rise(1)}>
                  {player.role && <span className="tag tag--accent">{player.role}</span>}
                  {player.league && <span className="tag">{player.league}</span>}
                </div>
                <h1 className="hero__name">
                  <Letters text={player.displayName} />
                </h1>
                {player.team && (
                  <Link to={`/teams/${encodeURIComponent(player.team)}`} className="hero__team with-img rise" style={rise(3)}>
                    <TeamLogo name={player.team} size={22} />
                    {player.team}
                  </Link>
                )}
                {summary && (
                  <>
                    <dl className="form rise" style={rise(4)}>
                      <div className="form__stat">
                        <dd className="form__value">
                          <CountUp value={summary.winRate} format={(v) => percent(v)} run={run} />
                        </dd>
                        <dt className="form__label">Win rate</dt>
                      </div>
                      <div className="form__stat">
                        <dd className="form__value">
                          <CountUp value={summary.kda} format={decimal} run={run} />
                        </dd>
                        <dt className="form__label">KDA</dt>
                      </div>
                      <div className="form__stat">
                        <dd className="form__value">
                          <CountUp value={summary.games} format={whole} run={run} />
                        </dd>
                        <dt className="form__label">Games</dt>
                      </div>
                    </dl>
                    <p className="form__note rise" style={rise(5)}>
                      Blue side {percent(rate(summary.blueWins, summary.blueGames))}, red side {percent(rate(summary.redWins, summary.redGames))}
                    </p>
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
          <ChampionPicker stage={stage} ariaLabel="Most-played champions" />
        </div>
      </section>
    </StageMotion>
  )
}

export function PlayerHeaderSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-busy="true">
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
