import { Fragment } from 'react'
import type { ContextMatch } from '../api/types'
import { useCountUp } from '../lib/useStageEffects'

/** A heading whose letters can rise in one after another (the stagger comes from --i). Words stay together when wrapping. */
export function Letters({ text }: { text: string }) {
  let n = 0
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(' ').map((word, w) => (
          <Fragment key={w}>
            {w > 0 && ' '}
            <span className="word">
              {[...word].map((ch) => (
                <span key={n} className="ch" style={{ ['--i' as string]: n++ }}>
                  {ch}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </>
  )
}

/** A stat that counts up from zero when `run` turns true. `format` turns the in-between number into text. */
export function CountUp({ value, format, run }: { value: number | null | undefined; format: (v: number | null) => string; run: boolean }) {
  const shown = useCountUp(value, run)
  return <>{format(shown)}</>
}

/** The last few series as small win/loss ticks, oldest on the left, most recent on the right. */
export function SeriesStrip({ results }: { results: ContextMatch[] | undefined }) {
  const rows = (results ?? []).filter((r) => r.won != null).slice(0, 8).reverse()
  if (rows.length === 0) return null
  return (
    <div className="strip rise" style={{ ['--i' as string]: 6 }} role="img" aria-label={`Recent series, oldest first: ${rows.map((r) => (r.won ? 'won' : 'lost')).join(', ')}`}>
      <span className="strip__label">Recent series</span>
      {rows.map((r, i) => (
        <i key={r.seriesId} className={`strip__tick ${r.won ? 'is-win' : 'is-loss'}`} style={{ ['--i' as string]: i }} title={`${r.won ? 'Won' : 'Lost'} ${r.score ?? ''} vs ${r.opponent}`}>
          {r.won ? 'W' : 'L'}
        </i>
      ))}
    </div>
  )
}
