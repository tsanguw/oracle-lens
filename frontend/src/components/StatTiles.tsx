import type { Summary } from '../api/types'
import { decimal, duration, NA, percent, rate, whole } from '../lib/format'

interface Tile {
  label: string
  value: string
  sub: string
}

function tiles(s: Summary): Tile[] {
  const kda = [s.kills, s.deaths, s.assists].every((v) => v != null)
    ? `${decimal(s.kills)} / ${decimal(s.deaths)} / ${decimal(s.assists)}`
    : NA
  return [
    { label: 'Games', value: String(s.games), sub: `${s.wins} W · ${s.losses} L` },
    {
      label: 'Win rate',
      value: percent(s.winRate),
      sub: `Blue ${percent(rate(s.blueWins, s.blueGames))} · Red ${percent(rate(s.redWins, s.redGames))}`,
    },
    { label: 'KDA', value: decimal(s.kda), sub: kda },
    { label: 'Kill participation', value: percent(s.killParticipation), sub: 'Team kills involved' },
    { label: 'Damage / min', value: whole(s.damagePerMin), sub: `Damage share ${percent(s.damageShare)}` },
    { label: 'Gold / min', value: whole(s.goldPerMin), sub: `Gold share ${percent(s.goldShare)}` },
    { label: 'CS / min', value: decimal(s.csPerMin), sub: 'Per game minute' },
    { label: 'Vision / min', value: decimal(s.visionPerMin), sub: 'Vision score rate' },
    {
      label: 'First blood',
      value: percent(s.firstBloodRate),
      sub: s.firstBloodRate == null ? 'Not tracked in source data' : 'Kill or assist',
    },
    { label: 'Champion pool', value: String(s.championPool), sub: 'Unique champions' },
    { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
    { label: 'Deaths / game', value: decimal(s.deaths, 2), sub: 'Average per game' },
  ]
}

export default function StatTiles({ summary }: { summary: Summary }) {
  return (
    <div className="tiles">
      {tiles(summary).map((t) => (
        <div key={t.label} className="tile">
          <span className="tile__label">{t.label}</span>
          <span className="tile__value">{t.value}</span>
          <span className="tile__sub">{t.sub}</span>
        </div>
      ))}
    </div>
  )
}

export function StatTilesSkeleton() {
  return (
    <div className="tiles" aria-busy="true">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="tile">
          <div className="skeleton" style={{ width: 90, height: 14 }} />
          <div className="skeleton" style={{ width: 70, height: 36 }} />
          <div className="skeleton" style={{ width: 110, height: 14 }} />
        </div>
      ))}
    </div>
  )
}
