import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { BracketSlot, StageRound, StageSeries } from '../api/types'
import { CARD_H, CARD_W, layoutBracket } from '../lib/bracketLayout'
import { TeamLogo } from './Images'

/** The short tag shown beside a team, from the region we hold for it. */
const REGION_TAG: Record<string, string> = {
  Korea: 'KR',
  China: 'CN',
  'North America': 'NA',
  Europe: 'EU',
  EMEA: 'EMEA',
  'Asia Pacific': 'APAC',
  Brazil: 'BR',
  Vietnam: 'VN',
  Japan: 'JP',
  CIS: 'CIS',
  SEA: 'SEA',
  Americas: 'AM',
  LMS: 'LMS',
  Taiwan: 'TW',
}
const tagFor = (region: string | null) => (region ? (REGION_TAG[region] ?? region.slice(0, 3).toUpperCase()) : null)

function Row({ slot }: { slot: BracketSlot }) {
  const tag = tagFor(slot.region)
  return (
    <div className={`brk__team${slot.won ? ' is-win' : ''}${slot.team === null ? ' is-empty' : ''}`}>
      <span className="brk__tag" data-region={tag ?? ''} title={slot.region ?? undefined}>
        {tag}
      </span>
      {slot.team ? (
        <>
          <TeamLogo name={slot.team} size={20} className="brk__logo" />
          <Link to={`/teams/${encodeURIComponent(slot.team)}`} className="brk__name">
            {slot.team}
          </Link>
        </>
      ) : (
        <span className="brk__name">To be decided</span>
      )}
      <span className="brk__score">{slot.score ?? ''}</span>
    </div>
  )
}

/** One series: two teams with their scores, the winner picked out. Used in the bracket and in the plain round lists. */
export function SeriesCard({ series, className = '', style }: { series: StageSeries; className?: string; style?: React.CSSProperties }) {
  const [a, b] = series.slots
  const label = series.played
    ? `${a.team} ${a.score ?? ''}, ${b.team} ${b.score ?? ''}; ${a.won ? a.team : b.team} won`
    : `${a.team ?? 'To be decided'} versus ${b.team ?? 'To be decided'}, not played yet`
  return (
    <div className={`brk__card${series.played ? '' : ' is-pending'} ${className}`} style={style} role="group" aria-label={label}>
      <Row slot={a} />
      <Row slot={b} />
    </div>
  )
}

/** A knockout stage as a bracket: rounds as columns, lines from each series to the one its winner plays next. */
export function Bracket({ rounds, label }: { rounds: StageRound[]; label: string }) {
  const layout = useMemo(() => layoutBracket(rounds), [rounds])
  return (
    <div className="brk" role="group" aria-label={label} tabIndex={0}>
      <div className="brk__canvas" style={{ width: layout.width, height: layout.height }}>
        <svg className="brk__lines" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.links.map((l, i) => {
            const mid = l.from.x + (l.to.x - l.from.x) / 2
            return <path key={i} className={l.kind === 'won' ? 'is-won' : l.kind === 'drop' ? 'is-drop' : undefined} d={`M${l.from.x} ${l.from.y} H${mid} V${l.to.y} H${l.to.x}`} />
          })}
        </svg>
        {layout.heads.map((h) => (
          <div key={h.x} className="brk__head" style={{ left: h.x, width: CARD_W }}>
            {h.name}
          </div>
        ))}
        {layout.placed.map((p) => (
          <SeriesCard key={p.series.seriesId} series={p.series} className="brk__abs" style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }} />
        ))}
      </div>
    </div>
  )
}

/** Rounds of any other stage (play-in, swiss, groups): a column of series cards per round. */
export function RoundColumns({ rounds, label }: { rounds: StageRound[]; label: string }) {
  return (
    <div className="brk brk--rounds" role="group" aria-label={label} tabIndex={0}>
      {rounds.map((r) => (
        <section key={`${r.order}-${r.name}`} className="brk__round" aria-label={r.name}>
          <h4 className="brk__head brk__head--flow">{r.name}</h4>
          {r.series.map((s) => (
            <SeriesCard key={s.seriesId} series={s} style={{ width: CARD_W, height: CARD_H }} />
          ))}
        </section>
      ))}
    </div>
  )
}
