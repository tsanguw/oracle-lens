import { Link } from 'react-router-dom'
import type { TeamPick, TeamPlayer, TeamSummary } from '../api/types'
import { decimal, duration, goldDiff, percent, rate, whole } from '../lib/format'
import { ChampionIcon, PlayerPhoto } from './Images'

interface Tile {
  label: string
  value: string
  sub: string
}

/** Two rows of five: how the team plays, then what it takes. Record and win rate live in the page header. */
function groups(s: TeamSummary): { title: string; tiles: Tile[] }[] {
  return [
    {
      title: 'Pace and combat',
      tiles: [
        { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
        { label: 'Kills / game', value: decimal(s.killsPerGame), sub: 'Team kills' },
        { label: 'Deaths / game', value: decimal(s.deathsPerGame), sub: 'Opponent kills' },
        { label: 'Gold / min', value: whole(s.goldPerMin), sub: 'Per game minute' },
        { label: 'Gold diff', value: goldDiff(s.goldDiff).replace(' gold', ''), sub: 'Avg final, vs opponents' },
      ],
    },
    {
      title: 'Objectives',
      tiles: [
        { label: 'Towers / game', value: decimal(s.towersPerGame), sub: 'Towers destroyed' },
        { label: 'Dragons / game', value: decimal(s.dragonsPerGame), sub: 'Dragons taken' },
        { label: 'Barons / game', value: decimal(s.baronsPerGame, 2), sub: 'Barons taken' },
        { label: 'Heralds / game', value: decimal(s.heraldsPerGame, 2), sub: 'Heralds taken' },
        { label: 'Void grubs / game', value: decimal(s.voidGrubsPerGame), sub: 'Grubs taken' },
      ],
    },
  ]
}

export function TeamTiles({ summary }: { summary: TeamSummary }) {
  return (
    <div className="tile-groups">
      {groups(summary).map((g) => (
        <div key={g.title}>
          <h3 className="ctx__sub tile-groups__title">{g.title}</h3>
          <div className="tiles tiles--five">
            {g.tiles.map((t) => (
              <div key={t.label} className="tile">
                <span className="tile__label">{t.label}</span>
                <span className="tile__value">{t.value}</span>
                <span className="tile__sub">{t.sub}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']

/** The starting five: for each role, the player with the most games. Everyone else is a fill-in. */
export function splitLineup(players: TeamPlayer[]): { starters: TeamPlayer[]; others: TeamPlayer[] } {
  const starters: TeamPlayer[] = []
  for (const role of ROLE_ORDER) {
    const best = players.filter((p) => p.role === role).sort((a, b) => b.games - a.games)[0]
    if (best) starters.push(best)
  }
  return { starters, others: players.filter((p) => !starters.includes(p)) }
}

export function TeamLineup({ players }: { players: TeamPlayer[] }) {
  return (
    <ol className="lineup">
      {players.map((p, i) => (
        <li key={p.page} style={{ ['--i' as string]: i }}>
          <Link to={`/players/${encodeURIComponent(p.page)}`} className={`lineup__card${p.underMinSample ? ' is-dim' : ''}`}>
            <span className="lineup__role">{p.role}</span>
            <PlayerPhoto page={p.page} name={p.name} role={p.role} size={96} />
            <span className="lineup__name">{p.name}</span>
            <span className="lineup__record">{`${p.wins}-${p.games - p.wins}`} in {p.games} games</span>
            <dl className="lineup__stats">
              <div>
                <dt>KDA</dt>
                <dd>{decimal(p.kda)}</dd>
              </div>
              <div>
                <dt>KP</dt>
                <dd>{percent(p.killParticipation)}</dd>
              </div>
              <div>
                <dt>DPM</dt>
                <dd>{whole(p.damagePerMin)}</dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ol>
  )
}

/** Blue and red side records, which the header's single win rate hides. */
export function SidePanel({ summary }: { summary: TeamSummary }) {
  const sides = [
    { name: 'Blue side', wins: summary.blueWins, games: summary.blueGames },
    { name: 'Red side', wins: summary.redWins, games: summary.redGames },
  ]
  return (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title">By side</h3>
        <span className="panel__note">Game record on each side</span>
      </div>
      <div className="sides">
        {sides.map((s) => (
          <div key={s.name} className="sides__item">
            <span className="sides__name">{s.name}</span>
            <span className="sides__value">{percent(rate(s.wins, s.games))}</span>
            <span className="sides__record">{s.games > 0 ? `${s.wins}-${s.games - s.wins}` : 'No games'}</span>
          </div>
        ))}
      </div>
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
