import type { ChampionRow } from '../api/types'
import { decimal, percent, whole } from '../lib/format'
import { ChampionIcon } from './Images'

const HEAD: { label: string; align: 'left' | 'right' }[] = [
  { label: 'Champion', align: 'left' },
  { label: 'Games', align: 'right' },
  { label: 'W-L', align: 'right' },
  { label: 'Win rate', align: 'right' },
  { label: 'KDA', align: 'right' },
  { label: 'CS/min', align: 'right' },
  { label: 'DPM', align: 'right' },
  { label: '', align: 'right' },
]

export default function ChampionPoolTable({ champions }: { champions: ChampionRow[] }) {
  return (
    <div className="table-wrap">
      <table className="pool">
        <thead>
          <tr>
            {HEAD.map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: h.align }}>
                {h.label}
                {h.label === '' && <span className="sr-only">Sample size note</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {champions.map((c) => (
            <tr key={c.champion} className={c.underMinSample ? 'is-dim' : undefined}>
              <td className="pool__champ">
                <span className="pool__champ-inner">
                  <ChampionIcon name={c.champion} />
                  {c.champion}
                </span>
              </td>
              <td>{c.games}</td>
              <td>{`${c.wins}-${c.losses}`}</td>
              <td>
                <span className="wr">
                  <span className="wr__track">
                    <span className="wr__fill" style={{ width: `${Math.round(c.winRate * 100)}%` }} />
                  </span>
                  {percent(c.winRate)}
                </span>
              </td>
              <td>{decimal(c.kda)}</td>
              <td>{decimal(c.csPerMin)}</td>
              <td>{whole(c.damagePerMin)}</td>
              <td className="pool__flag">{c.underMinSample ? 'Under 5 games' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChampionPoolSkeleton() {
  return (
    <div className="table-wrap" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 61, borderTop: '1px solid var(--border)' }} />
      ))}
    </div>
  )
}
