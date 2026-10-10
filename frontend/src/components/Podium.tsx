import { Link } from 'react-router-dom'
import type { LeaderboardRow } from '../api/types'
import { decimal, percent, shortTeam, whole } from '../lib/format'
import { PlayerPhoto, TeamLogo } from './Images'

type SortKey = 'games' | 'winRate' | 'kda' | 'killParticipation' | 'damagePerMin' | 'csPerMin' | 'visionPerMin'

const STATS: Record<SortKey, { label: string; value: (r: LeaderboardRow) => string }> = {
  kda: { label: 'KDA', value: (r) => decimal(r.kda) },
  winRate: { label: 'Win rate', value: (r) => percent(r.winRate) },
  killParticipation: { label: 'KP', value: (r) => percent(r.killParticipation) },
  damagePerMin: { label: 'DPM', value: (r) => whole(r.damagePerMin) },
  csPerMin: { label: 'CS/min', value: (r) => decimal(r.csPerMin) },
  visionPerMin: { label: 'Vision/min', value: (r) => decimal(r.visionPerMin, 2) },
  games: { label: 'Games', value: (r) => String(r.games) },
}

/** The three leaders for whatever the table is sorted by: the sorted stat first, then two of KDA, win rate and KP. */
export default function Podium({ rows, sort }: { rows: LeaderboardRow[]; sort: SortKey }) {
  const keys: SortKey[] = [sort, ...(['kda', 'winRate', 'killParticipation'] as SortKey[]).filter((k) => k !== sort)].slice(0, 3)
  return (
    <ol className="lineup lineup--podium" aria-label={`Top three by ${STATS[sort].label}`}>
      {rows.map((r, i) => (
        <li key={r.page} style={{ ['--i' as string]: i }}>
          <Link to={`/players/${encodeURIComponent(r.page)}`} className={`lineup__card${i === 0 ? ' is-first' : ''}`}>
            <span className="lineup__role with-img">
              <span className="podium__rank">{r.rank}</span>
              {r.team && <TeamLogo name={r.team} size={16} />}
              {r.team ? shortTeam(r.team) : (r.league ?? 'INTL')}
            </span>
            <PlayerPhoto page={r.page} name={r.name} role={r.role} size={96} />
            <span className="lineup__name">{r.name}</span>
            <span className="lineup__record">
              {r.role ?? 'N/A'}, {r.league ?? 'INTL'}, {r.games} games
            </span>
            <dl className="lineup__stats">
              {keys.map((k, n) => (
                <div key={k} className={n === 0 ? 'is-sorted' : undefined}>
                  <dt>{STATS[k].label}</dt>
                  <dd>{STATS[k].value(r)}</dd>
                </div>
              ))}
            </dl>
          </Link>
        </li>
      ))}
    </ol>
  )
}
