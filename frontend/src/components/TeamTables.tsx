import { Link } from 'react-router-dom'
import type { TeamPick, TeamPlayer, TeamSummary } from '../api/types'
import { decimal, duration, goldDiff, percent, rate, whole } from '../lib/format'
import { ChampionIcon, PlayerPhoto } from './Images'

interface Tile {
  label: string
  value: string
  sub: string
}

function tiles(s: TeamSummary): Tile[] {
  return [
    { label: 'Games', value: String(s.games), sub: `${s.wins} W · ${s.losses} L` },
    {
      label: 'Win rate',
      value: percent(s.winRate),
      sub: `Blue ${percent(rate(s.blueWins, s.blueGames))} · Red ${percent(rate(s.redWins, s.redGames))}`,
    },
    { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
    { label: 'Kills / game', value: decimal(s.killsPerGame), sub: 'Team kills' },
    { label: 'Deaths / game', value: decimal(s.deathsPerGame), sub: 'Opponent kills' },
    { label: 'Gold / min', value: whole(s.goldPerMin), sub: `Avg diff ${goldDiff(s.goldDiff)}` },
    { label: 'Towers / game', value: decimal(s.towersPerGame), sub: 'Towers destroyed' },
    { label: 'Dragons / game', value: decimal(s.dragonsPerGame), sub: 'Dragons taken' },
    { label: 'Barons / game', value: decimal(s.baronsPerGame, 2), sub: 'Barons taken' },
    { label: 'Heralds / game', value: decimal(s.heraldsPerGame, 2), sub: 'Heralds taken' },
    { label: 'Void grubs / game', value: decimal(s.voidGrubsPerGame), sub: 'Grubs taken' },
    { label: 'Gold diff', value: goldDiff(s.goldDiff).replace(' gold', ''), sub: 'Avg final, vs opponents' },
  ]
}

export function TeamTiles({ summary }: { summary: TeamSummary }) {
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

export function TeamPlayersTable({ players }: { players: TeamPlayer[] }) {
  const head = ['Role', 'Player', 'Games', 'W-L', 'Win rate', 'KDA', 'KP', 'DPM', 'CS/min', '']
  return (
    <div className="table-wrap">
      <table className="pool">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: i < 2 ? 'left' : 'right' }}>
                {h}
                {h === '' && <span className="sr-only">Sample size note</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.page} className={p.underMinSample ? 'is-dim' : undefined}>
              <td className="pool__champ pool__role">{p.role ?? 'N/A'}</td>
              <td className="pool__champ">
                <span className="with-img">
                  <PlayerPhoto page={p.page} name={p.name} role={p.role} size={28} />
                  <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link">
                    {p.name}
                  </Link>
                </span>
              </td>
              <td>{p.games}</td>
              <td>{`${p.wins}-${p.games - p.wins}`}</td>
              <td>{percent(p.winRate)}</td>
              <td>{decimal(p.kda)}</td>
              <td>{percent(p.killParticipation)}</td>
              <td>{whole(p.damagePerMin)}</td>
              <td>{decimal(p.csPerMin)}</td>
              <td className="pool__flag">{p.underMinSample ? 'Under 5 games' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TeamPicksTable({ picks }: { picks: TeamPick[] }) {
  return (
    <div className="table-wrap">
      <table className="pool">
        <thead>
          <tr>
            {['Champion', 'Games', 'W-L', 'Win rate', ''].map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: i === 0 ? 'left' : 'right' }}>
                {h}
                {h === '' && <span className="sr-only">Sample size note</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {picks.map((c) => (
            <tr key={c.champion} className={c.underMinSample ? 'is-dim' : undefined}>
              <td className="pool__champ">
                <span className="pool__champ-inner">
                  <ChampionIcon name={c.champion} />
                  {c.champion}
                </span>
              </td>
              <td>{c.games}</td>
              <td>{`${c.wins}-${c.games - c.wins}`}</td>
              <td>
                <span className="wr">
                  <span className="wr__track">
                    <span className="wr__fill" style={{ width: `${Math.round(c.winRate * 100)}%` }} />
                  </span>
                  {percent(c.winRate)}
                </span>
              </td>
              <td className="pool__flag">{c.underMinSample ? 'Under 5 games' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
