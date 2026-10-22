import { NA } from '../lib/format'
import { winner, type StatRow } from '../lib/compareRows'

const MIN_GAMES = 5

/** Bars grow from the centre; they compare the two subjects with each other, so the longer value fills most of its side. */
const widths = (a: number | null, b: number | null): [number, number] => {
  const hi = Math.max(a ?? 0, b ?? 0, 0) * 1.08
  if (hi <= 0) return [0, 0]
  return [(Math.max(a ?? 0, 0) / hi) * 100, (Math.max(b ?? 0, 0) / hi) * 100]
}

/** The tale of the tape: one row per stat, the two values outside, mirrored bars between, the better figure in green. */
export default function VersusTape<S extends { games: number }>({
  rows,
  a,
  b,
  names,
}: {
  rows: StatRow<S>[]
  a: S | null
  b: S | null
  names: [string, string]
}) {
  const thin = [a, b].some((s) => s !== null && s.games < MIN_GAMES)
  return (
    <>
      <div className="tape">
        <div className="tape__head" aria-hidden="true">
          <span>{names[0]}</span>
          <span>{names[1]}</span>
        </div>
        <ul className="tape__list" aria-label="Stat comparison">
          {rows.map((row) => {
            const av = a ? row.value(a) : null
            const bv = b ? row.value(b) : null
            const win = winner(row, av, bv)
            // Rows with no better direction (games played, game length) are numbers only: a longer bar would read as better.
            const [wa, wb] = row.better ? widths(av, bv) : [0, 0]
            return (
              <li key={row.label} className="tape__row">
                <span className="tape__label">{row.label}</span>
                <span className={`tape__val tape__val--a${win === 'a' ? ' is-better' : ''}`}>
                  <span className="sr-only">{names[0]}: </span>
                  {a ? row.format(av) : NA}
                  {win === 'a' && <span className="sr-only"> (better)</span>}
                </span>
                <span className={`tape__val tape__val--b${win === 'b' ? ' is-better' : ''}`}>
                  <span className="sr-only">{names[1]}: </span>
                  {b ? row.format(bv) : NA}
                  {win === 'b' && <span className="sr-only"> (better)</span>}
                </span>
                <span className="tape__bar tape__bar--a" aria-hidden="true">
                  <i className={win === 'a' ? 'is-better' : undefined} style={{ width: `${wa}%` }} />
                </span>
                <span className="tape__bar tape__bar--b" aria-hidden="true">
                  <i className={win === 'b' ? 'is-better' : undefined} style={{ width: `${wb}%` }} />
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      {thin && <p className="section__note">One side has fewer than {MIN_GAMES} games here, so small differences mean little.</p>}
    </>
  )
}
