import { useRef, useState, type KeyboardEvent } from 'react'
import type { TournamentStage } from '../api/types'
import { Bracket, RoundColumns } from './Bracket'
import SwissRecords from './SwissRecords'

const NOTE: Record<TournamentStage['key'], string> = {
  playin: 'Play-in rounds, in the order they were played',
  groups: 'Every series, round by round',
  swiss: 'Swiss rounds: teams with the same record meet each other',
  knockout: 'The winner of each series moves on; scores are in games',
}

/** The event's stages as tabs (play-in, swiss, knockout...), each showing its series; the knockout one as a bracket. */
export default function TournamentStages({ stages }: { stages: TournamentStage[] }) {
  const knockout = stages.findIndex((s) => s.key === 'knockout')
  const [active, setActive] = useState(knockout >= 0 ? knockout : stages.length - 1)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const stage = stages[active] ?? stages[0]
  if (!stage) return null

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? stages.length - 1 : (active + step + stages.length) % stages.length
    setActive(next)
    tabs.current[next]?.focus()
  }

  return (
    <section aria-labelledby="stages" className="section">
      <div className="section__head">
        <h2 id="stages" className="section__title">
          Stages
        </h2>
        <span className="section__note">{NOTE[stage.key]}</span>
      </div>
      <div className="stagetabs" role="tablist" aria-label="Event stages" onKeyDown={onKey}>
        {stages.map((s, i) => (
          <button
            key={s.key}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`stage-tab-${s.key}`}
            aria-selected={i === active}
            aria-controls="stage-panel"
            tabIndex={i === active ? 0 : -1}
            className={`stagetabs__tab${i === active ? ' is-on' : ''}`}
            onClick={() => setActive(i)}
          >
            {s.label}
            <span className="stagetabs__count">{s.rounds.reduce((n, r) => n + r.series.length, 0)}</span>
          </button>
        ))}
      </div>
      <div id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${stage.key}`}>
        {stage.standings && <SwissRecords standings={stage.standings} />}
        {stage.key === 'knockout' ? <Bracket rounds={stage.rounds} label={`${stage.label} bracket`} /> : <RoundColumns rounds={stage.rounds} label={`${stage.label} rounds`} />}
      </div>
    </section>
  )
}
