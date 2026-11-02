import { Link } from 'react-router-dom'
import type { SwissRow } from '../api/types'
import { TeamLogo } from './Images'

/**
 * Where every team stands in a swiss stage, grouped by record (3-0, 3-1 ...), best first. The top record has advanced
 * and the worst has been eliminated, once anyone has reached them. `settled` says the knockout exists, so those tags are
 * final; while rounds are still being played, a 1-0 or 0-1 record is not an outcome and the tags stay off.
 */
export default function SwissRecords({ standings, settled }: { standings: SwissRow[]; settled: boolean }) {
  if (standings.length === 0) return null
  const groups = new Map<string, SwissRow[]>()
  for (const row of standings) groups.set(`${row.wins}-${row.losses}`, [...(groups.get(`${row.wins}-${row.losses}`) ?? []), row])
  const maxWins = Math.max(...standings.map((r) => r.wins))
  const maxLosses = Math.max(...standings.map((r) => r.losses))
  const status = (r: SwissRow) => (!settled ? null : r.wins === maxWins && maxWins > 0 ? 'advanced' : r.losses === maxLosses && maxLosses > 0 ? 'out' : null)
  return (
    <div className="swiss" role="group" aria-label="Swiss records">
      {[...groups.entries()].map(([record, rows]) => (
        <section key={record} className={`swiss__group${status(rows[0]) ? ` is-${status(rows[0])}` : ''}`} aria-label={`Record ${record}`}>
          <h4 className="swiss__record">
            {record.replace('-', '–')}
            {status(rows[0]) && <span className="swiss__tag">{status(rows[0]) === 'advanced' ? 'Advanced' : 'Eliminated'}</span>}
          </h4>
          <ul className="swiss__teams">
            {rows.map((r) => (
              <li key={r.team}>
                <TeamLogo name={r.team} size={20} />
                <Link to={`/teams/${encodeURIComponent(r.team)}`}>{r.team}</Link>
                <span className="swiss__path" aria-label={`Results: ${r.results.join(', ')}`}>
                  {r.results.map((x, i) => (
                    <i key={i} className={x === 'W' ? 'is-win' : 'is-loss'} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
