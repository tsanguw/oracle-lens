import { Link } from 'react-router-dom'
import type {
  ChampionContextResponse,
  ChampionPatchRow,
  ChampionPlayer,
  ChampionResponse,
  ChampionRoleRow,
  ChampionSummary,
  ChampionTeam,
} from '../api/types'
import { decimal, duration, NA, percent, rate, whole } from '../lib/format'
import { ContextPanel, ContextSkeleton, ContextStrip, EventList } from './LinkedInfo'
import { ChampionIcon, PlayerPhoto, TeamLogo } from './Images'

export function ChampionHeader({ data }: { data: ChampionResponse }) {
  const { champion, summary, range } = data
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="hero-img">
            <ChampionIcon name={champion.name} size={128} />
          </div>
          <div className="hero__text">
            <div className="tags">{summary?.role && <span className="tag tag--gold">{summary.role}</span>}</div>
            <h1 className="hero__name hero__name--team">{champion.name}</h1>
          </div>
        </div>
        <div className="showing">
          <span className="showing__eyebrow">Showing</span>
          <span className="showing__label">{range.label}</span>
          <span className="showing__desc">Qualifiers and promotion series are not considered</span>
        </div>
      </div>
    </section>
  )
}

export function ChampionHeaderSkeleton() {
  return (
    <section className="hero" aria-busy="true">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="photo skeleton" />
          <div className="hero__text">
            <div className="skeleton" style={{ width: 90, height: 22 }} />
            <div className="skeleton" style={{ width: 300, height: 70 }} />
          </div>
        </div>
      </div>
    </section>
  )
}

/** Related info: who is playing the champion, which teams, and the events it is showing up in. */
export function ChampionContext({ data }: { data: ChampionContextResponse | null }) {
  if (!data) return <ContextSkeleton />
  return (
    <ContextStrip>
      <ContextPanel title="Top players" note="In the latest split of each league plus internationals.">
        {data.players.length > 0 ? (
          <ul className="ctx__list">
            {data.players.map((p) => (
              <li key={p.page}>
                <Link to={`/players/${encodeURIComponent(p.page)}`} className="ctx__row ctx__row--champ">
                  <span className="ctx__name">{p.name}</span>
                  <span className="ctx__meta">{p.team ?? ''}</span>
                  <span className="ctx__meta">{p.games} games</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ctx__empty">Not played recently.</p>
        )}
      </ContextPanel>
      <ContextPanel title="Top teams">
        {data.teams.length > 0 ? (
          <ul className="ctx__list">
            {data.teams.map((t) => (
              <li key={t.name}>
                <Link to={`/teams/${encodeURIComponent(t.name)}`} className="ctx__row ctx__row--champ">
                  <span className="ctx__name">{t.name}</span>
                  <span className="ctx__meta">{percent(t.winRate)} win</span>
                  <span className="ctx__meta">{t.games} games</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ctx__empty">Not played recently.</p>
        )}
      </ContextPanel>
      <ContextPanel title="Recent events" note="Latest events where it has been played.">
        {data.events.length > 0 ? <EventList events={data.events} /> : <p className="ctx__empty">No events.</p>}
      </ContextPanel>
    </ContextStrip>
  )
}

interface Tile {
  label: string
  value: string
  sub: string
}

function tiles(s: ChampionSummary): Tile[] {
  return [
    { label: 'Games', value: String(s.games), sub: `${s.wins} W · ${s.losses} L` },
    {
      label: 'Win rate',
      value: percent(s.winRate),
      sub: `Blue ${percent(rate(s.blueWins, s.blueGames))} · Red ${percent(rate(s.redWins, s.redGames))}`,
    },
    { label: 'Pick rate', value: percent(s.pickRate), sub: `Of ${s.totalGames.toLocaleString('en-US')} games` },
    { label: 'Ban rate', value: percent(s.banRate), sub: 'Banned by either team' },
    { label: 'Presence', value: percent(s.presence), sub: 'Picked or banned' },
    { label: 'KDA', value: decimal(s.kda), sub: 'Kills + assists per death' },
    { label: 'Kill participation', value: percent(s.killParticipation), sub: 'Team kills involved' },
    { label: 'Damage / min', value: whole(s.damagePerMin), sub: 'To champions' },
    { label: 'Gold / min', value: whole(s.goldPerMin), sub: 'Per game minute' },
    { label: 'CS / min', value: decimal(s.csPerMin), sub: 'Per game minute' },
    { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
    { label: 'Main role', value: s.role ?? NA, sub: 'Most played' },
  ]
}

export function ChampionTiles({ summary }: { summary: ChampionSummary }) {
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

const flag = (under: boolean) => (under ? 'Under 5 games' : '')

function Table({ head, children }: { head: { label: string; left?: boolean }[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="pool">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: h.left ? 'left' : 'right' }}>
                {h.label}
                {h.label === '' && <span className="sr-only">Sample size note</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function ChampionPlayersTable({ players }: { players: ChampionPlayer[] }) {
  return (
    <Table head={[{ label: 'Player', left: true }, { label: 'Team', left: true }, { label: 'Games' }, { label: 'W-L' }, { label: 'Win rate' }, { label: 'KDA' }, { label: '' }]}>
      {players.map((p) => (
        <tr key={p.page} className={p.underMinSample ? 'is-dim' : undefined}>
          <td className="pool__champ">
            <span className="with-img">
              <PlayerPhoto page={p.page} name={p.name} size={28} />
              <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link">
                {p.name}
              </Link>
            </span>
          </td>
          <td className="pool__champ pool__role" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 15 }}>
            {p.team ? (
              <span className="with-img">
                <TeamLogo name={p.team} size={22} />
                <Link to={`/teams/${encodeURIComponent(p.team)}`} className="pool__link">
                  {p.team}
                </Link>
              </span>
            ) : (
              NA
            )}
          </td>
          <td>{p.games}</td>
          <td>{`${p.wins}-${p.games - p.wins}`}</td>
          <td>{percent(p.winRate)}</td>
          <td>{decimal(p.kda)}</td>
          <td className="pool__flag">{flag(p.underMinSample)}</td>
        </tr>
      ))}
    </Table>
  )
}

export function ChampionTeamsTable({ teams }: { teams: ChampionTeam[] }) {
  return (
    <Table head={[{ label: 'Team', left: true }, { label: 'Games' }, { label: 'W-L' }, { label: 'Win rate' }, { label: '' }]}>
      {teams.map((t) => (
        <tr key={t.name} className={t.underMinSample ? 'is-dim' : undefined}>
          <td className="pool__champ">
            <span className="with-img">
              <TeamLogo name={t.name} size={24} />
              <Link to={`/teams/${encodeURIComponent(t.name)}`} className="pool__link">
                {t.name}
              </Link>
            </span>
          </td>
          <td>{t.games}</td>
          <td>{`${t.wins}-${t.games - t.wins}`}</td>
          <td>{percent(t.winRate)}</td>
          <td className="pool__flag">{flag(t.underMinSample)}</td>
        </tr>
      ))}
    </Table>
  )
}

export function ChampionRolesTable({ roles }: { roles: ChampionRoleRow[] }) {
  return (
    <Table head={[{ label: 'Role', left: true }, { label: 'Games' }, { label: 'W-L' }, { label: 'Win rate' }]}>
      {roles.map((r) => (
        <tr key={r.role}>
          <td className="pool__champ">{r.role}</td>
          <td>{r.games}</td>
          <td>{`${r.wins}-${r.games - r.wins}`}</td>
          <td>{percent(r.winRate)}</td>
        </tr>
      ))}
    </Table>
  )
}

export function ChampionPatchesTable({ patches }: { patches: ChampionPatchRow[] }) {
  return (
    <Table head={[{ label: 'Patch', left: true }, { label: 'Games' }, { label: 'W-L' }, { label: 'Win rate' }, { label: 'Pick rate' }]}>
      {patches.map((p) => (
        <tr key={p.patch}>
          <td className="pool__champ">{p.patch}</td>
          <td>{p.games}</td>
          <td>{`${p.wins}-${p.games - p.wins}`}</td>
          <td>{percent(p.winRate)}</td>
          <td>{percent(p.pickRate)}</td>
        </tr>
      ))}
    </Table>
  )
}
