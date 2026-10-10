import type { CSSProperties } from 'react'
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
import { ArtCredit, StageBackdrop, StageMotion, stageClass, useSingleStage } from './ChampionStage'
import { CountUp, Letters } from './StageBits'
import { ContextPanel, ContextSkeleton, ContextStrip, EventList } from './LinkedInfo'
import { ChampionIcon, PlayerPhoto, TeamLogo } from './Images'

export function ChampionHeader({ data }: { data: ChampionResponse }) {
  const { champion, summary, range } = data
  const stage = useSingleStage(champion.name)
  const run = stage.entered
  const count = (v: number | null) => (v == null ? NA : String(Math.round(v)))
  const rise = (n: number) => ({ ['--i' as string]: n }) as CSSProperties
  return (
    <StageMotion>
      <section ref={stage.headerRef} className={stageClass(stage)} style={{ '--rc': stage.accent } as CSSProperties}>
        <StageBackdrop stage={stage} />
        <div className="container hero__inner">
          <div className="hero__main">
            <div className="hero__who">
              <div className="hero-img rise" style={rise(0)}>
                <ChampionIcon name={champion.name} size={128} />
              </div>
              <div className="hero__text">
                <div className="tags rise" style={rise(1)}>
                  {summary?.role && <span className="tag tag--accent">{summary.role}</span>}
                </div>
                <h1 className="hero__name hero__name--team">
                  <Letters text={champion.name} />
                </h1>
                {summary && (
                  <dl className="form rise" style={rise(4)}>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.presence} format={(v) => percent(v)} run={run} />
                      </dd>
                      <dt className="form__label">Presence</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.winRate} format={(v) => percent(v)} run={run} />
                      </dd>
                      <dt className="form__label">Win rate</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.games} format={count} run={run} />
                      </dd>
                      <dt className="form__label">Games</dt>
                    </div>
                  </dl>
                )}
              </div>
            </div>
            <div className="showing rise" style={rise(7)}>
              <span className="showing__eyebrow">Showing</span>
              <span className="showing__label">{range.label}</span>
              <span className="showing__desc">Qualifiers and promotion series are not considered</span>
            </div>
          </div>
          <ArtCredit stage={stage} />
        </div>
      </section>
    </StageMotion>
  )
}

export function ChampionHeaderSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-busy="true">
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

/** Presence, win rate and games are in the page header; these are the rest, in two groups. */
function groups(s: ChampionSummary): { title: string; className: string; tiles: Tile[] }[] {
  return [
    {
      title: 'In the draft',
      className: 'tiles tiles--four',
      tiles: [
        { label: 'Pick rate', value: percent(s.pickRate), sub: `Of ${s.totalGames.toLocaleString('en-US')} games` },
        { label: 'Ban rate', value: percent(s.banRate), sub: 'Banned by either team' },
        { label: 'Blue side', value: percent(rate(s.blueWins, s.blueGames)), sub: `${s.blueWins}-${s.blueGames - s.blueWins} win rate` },
        { label: 'Red side', value: percent(rate(s.redWins, s.redGames)), sub: `${s.redWins}-${s.redGames - s.redWins} win rate` },
      ],
    },
    {
      title: 'In the game',
      className: 'tiles',
      tiles: [
        { label: 'KDA', value: decimal(s.kda), sub: 'Kills + assists per death' },
        { label: 'Kill participation', value: percent(s.killParticipation), sub: 'Team kills involved' },
        { label: 'Damage / min', value: whole(s.damagePerMin), sub: 'To champions' },
        { label: 'Gold / min', value: whole(s.goldPerMin), sub: 'Per game minute' },
        { label: 'CS / min', value: decimal(s.csPerMin), sub: 'Per game minute' },
        { label: 'Avg game', value: duration(s.avgGameLengthSec), sub: 'Game length' },
      ],
    },
  ]
}

export function ChampionTiles({ summary }: { summary: ChampionSummary }) {
  return (
    <div className="tile-groups">
      {groups(summary).map((g) => (
        <div key={g.title}>
          <h3 className="ctx__sub tile-groups__title">{g.title}</h3>
          <div className={g.className}>
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

/** The five players with the most games on the champion, as photo cards. */
export function ChampionPlayerCards({ players }: { players: ChampionPlayer[] }) {
  return (
    <ol className="lineup">
      {players.map((p, i) => (
        <li key={p.page} style={{ ['--i' as string]: i }}>
          <Link to={`/players/${encodeURIComponent(p.page)}`} className={`lineup__card${p.underMinSample ? ' is-dim' : ''}`}>
            <span className="lineup__role with-img">
              {p.team && <TeamLogo name={p.team} size={16} />}
              {p.team ?? NA}
            </span>
            <PlayerPhoto page={p.page} name={p.name} size={96} />
            <span className="lineup__name">{p.name}</span>
            <span className="lineup__record">{`${p.wins}-${p.games - p.wins}`} in {p.games} games</span>
            <dl className="lineup__stats">
              <div>
                <dt>Win rate</dt>
                <dd>{percent(p.winRate)}</dd>
              </div>
              <div>
                <dt>KDA</dt>
                <dd>{decimal(p.kda)}</dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ol>
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
