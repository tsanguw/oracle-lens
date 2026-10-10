import type { Summary } from '../api/types'
import { decimal, duration, percent, whole } from '../lib/format'

interface Tile {
  label: string
  value: string
  sub: string
}

/** Win rate, KDA and games are in the page header; the rest are in two groups of five. */
function groups(s: Summary): { title: string; tiles: Tile[] }[] {
  return [
    {
      title: 'In the fight',
      tiles: [
        { label: 'Kill participation', value: percent(s.killParticipation), sub: 'Team kills involved' },
        { label: 'Deaths / game', value: decimal(s.deaths, 2), sub: 'Average per game' },
        { label: 'Damage / min', value: whole(s.damagePerMin), sub: 'To champions' },
        { label: 'Damage share', value: percent(s.damageShare), sub: 'Of team damage' },
        {
          label: 'First blood',
          value: percent(s.firstBloodRate),
          sub: s.firstBloodRate == null ? 'Not tracked in source data' : 'Kill or assist',
        },
      ],
    },
    {
      title: 'Economy and map',
      tiles: [
        { label: 'Gold / min', value: whole(s.goldPerMin), sub: 'Per game minute' },
        { label: 'Gold share', value: percent(s.goldShare), sub: 'Of team gold' },
        { label: 'CS / min', value: decimal(s.csPerMin), sub: 'Per game minute' },
        { label: 'Vision / min', value: decimal(s.visionPerMin), sub: 'Vision score rate' },
        { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
      ],
    },
  ]
}

export default function StatTiles({ summary }: { summary: Summary }) {
  return (
    <div className="tile-groups">
      {groups(summary).map((g) => (
        <div key={g.title}>
          <h3 className="ctx__sub tile-groups__title">{g.title}</h3>
          <div className="tiles tiles--five">
            {g.tiles.map((tile) => (
              <div key={tile.label} className="tile">
                <span className="tile__label">{tile.label}</span>
                <span className="tile__value">{tile.value}</span>
                <span className="tile__sub">{tile.sub}</span>
              </div>
            ))}
          </div>
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
