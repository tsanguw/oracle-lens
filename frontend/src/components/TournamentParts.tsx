import { Fragment, useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type {
  SeriesRow,
  StandingRow,
  TournamentChampion,
  TournamentContextResponse,
  TournamentPlayer,
  TournamentResponse,
} from '../api/types'
import { dateRange, decimal, duration, matchClock, matchTime, NA, percent, statusBadge, whole } from '../lib/format'
import { dayLabel, groupByDay } from '../lib/matchFilter'
import { ChampionPicker, StageBackdrop, StageMotion, stageClass, usePresenceStage } from './ChampionStage'
import { ContextPanel, ContextSkeleton, ContextStrip, EventList } from './LinkedInfo'
import { CountUp, Letters } from './StageBits'
import { ChampionIcon, PlayerPhoto, TeamLogo } from './Images'
import SeriesGames from './SeriesGames'

const teamLink = (name: string) => `/teams/${encodeURIComponent(name)}`

export function TournamentHeader({ data, champions }: { data: TournamentResponse; champions?: TournamentChampion[] }) {
  const { tournament: t, summary } = data
  const leagueTag = t.league ?? (t.isInternational ? 'INTL' : t.leagues.join(' / ') || null)
  const stage = usePresenceStage(champions)
  const run = stage.entered
  const count = (v: number | null) => (v == null ? NA : String(Math.round(v)))
  const rise = (n: number) => ({ ['--i' as string]: n }) as CSSProperties
  return (
    <StageMotion>
      <section ref={stage.headerRef} className={stageClass(stage)} style={{ '--rc': stage.accent } as CSSProperties}>
        <StageBackdrop stage={stage} />
        <div className="container hero__inner">
          <div className="hero__main">
            <div className="hero__text">
              <div className="tags rise" style={rise(1)}>
                {leagueTag && <span className="tag tag--accent">{leagueTag}</span>}
                {t.stage && <span className="tag">{t.stage}</span>}
                <span className={statusBadge(t.status)}>{t.status}</span>
              </div>
              <h1 className="hero__name hero__name--team">
                <Letters text={t.name} />
              </h1>
              <span className="hero__team rise" style={rise(3)}>
                {dateRange(t.startDate, t.endDate)}
              </span>
              {summary && (
                <>
                  <dl className="form rise" style={rise(4)}>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.games} format={count} run={run} />
                      </dd>
                      <dt className="form__label">Games</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.series} format={count} run={run} />
                      </dd>
                      <dt className="form__label">Series</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">
                        <CountUp value={summary.teams} format={count} run={run} />
                      </dd>
                      <dt className="form__label">Teams</dt>
                    </div>
                    <div className="form__stat">
                      <dd className="form__value">{duration(summary.avgGameLengthSec)}</dd>
                      <dt className="form__label">Avg game</dt>
                    </div>
                  </dl>
                  <p className="form__note rise" style={rise(5)}>
                    Blue side wins {percent(summary.blueWinRate)}, {decimal(summary.killsPerGame)} kills per game
                    {summary.patches.length > 0 && `, patch ${patchLabel(summary.patches)}`}
                  </p>
                </>
              )}
            </div>
            {summary?.standingTeam && (
              <div className="showing rise" style={rise(7)}>
                <span className="showing__eyebrow">{summary.standingLabel}</span>
                <Link to={teamLink(summary.standingTeam)} className="showing__label with-img">
                  <TeamLogo name={summary.standingTeam} size={32} />
                  {summary.standingTeam}
                </Link>
              </div>
            )}
          </div>
          <ChampionPicker stage={stage} ariaLabel="Most contested champions" />
        </div>
      </section>
    </StageMotion>
  )
}

export function TournamentHeaderSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-busy="true">
      <div className="container hero__inner">
        <div className="hero__text">
          <div className="skeleton" style={{ width: 160, height: 22 }} />
          <div className="skeleton" style={{ width: 420, height: 64 }} />
        </div>
      </div>
    </section>
  )
}

export function SeriesList({ series }: { series: SeriesRow[] }) {
  return (
    <ul className="ctx__list">
      {series.map((s) => (
        <li key={s.seriesId}>
          <div className="series">
            <span className="series__teams">
              {[s.team1, s.team2].map((team, i) =>
                team ? (
                  <Link key={i} to={teamLink(team)} className={`series__team with-img${s.winner === team ? ' is-winner' : ''}`}>
                    <TeamLogo name={team} size={20} />
                    {team}
                  </Link>
                ) : (
                  <span key={i} className="series__team">TBD</span>
                ),
              )}
            </span>
            <span className="series__score">{s.score ?? (s.bestOf ? `Bo${s.bestOf}` : '')}</span>
            <span className="ctx__meta series__when">{matchTime(s.at)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Related info: leading teams, schedule and results, and the other events of the same year. */
export function TournamentContext({ data }: { data: TournamentContextResponse | null }) {
  if (!data) return <ContextSkeleton />
  return (
    <ContextStrip>
      <ContextPanel title="Leading teams" note="By series record, then game difference.">
        {data.teams.length > 0 ? (
          <ul className="ctx__list">
            {data.teams.map((t) => (
              <li key={t.team}>
                <Link to={teamLink(t.team)} className="ctx__row ctx__row--champ">
                  <span className="ctx__name with-img">
                    <TeamLogo name={t.team} size={24} />
                    {t.team}
                  </span>
                  <span className="ctx__meta">{t.seriesWins}-{t.seriesLosses} series</span>
                  <span className="ctx__meta">{t.gameWins}-{t.gameLosses} games</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ctx__empty">No games yet.</p>
        )}
      </ContextPanel>
      <ContextPanel title="Schedule">
        <h4 className="ctx__sub">Upcoming</h4>
        {data.upcoming.length > 0 ? <SeriesList series={data.upcoming} /> : <p className="ctx__empty">No upcoming matches scheduled.</p>}
        {data.results.length > 0 && (
          <>
            <h4 className="ctx__sub">Latest results</h4>
            <SeriesList series={data.results} />
          </>
        )}
      </ContextPanel>
      <ContextPanel title="Related events" note="Same league and year, or the other internationals.">
        {data.related.length > 0 ? <EventList events={data.related} /> : <p className="ctx__empty">No other events.</p>}
      </ContextPanel>
    </ContextStrip>
  )
}

/** One patch, or the first few of a long event. */
function patchLabel(patches: string[]): string {
  return patches.length <= 3 ? patches.join(', ') : `${patches.slice(0, 3).join(', ')} and ${patches.length - 3} more`
}

/** The five best players by KDA as photo cards. */
export function TournamentPlayerCards({ players }: { players: TournamentPlayer[] }) {
  return (
    <ol className="lineup">
      {players.map((p, i) => (
        <li key={p.page} style={{ ['--i' as string]: i }}>
          <Link to={`/players/${encodeURIComponent(p.page)}`} className="lineup__card">
            <span className="lineup__role with-img">
              {p.team && <TeamLogo name={p.team} size={16} />}
              {p.team ?? NA}
            </span>
            <PlayerPhoto page={p.page} name={p.name} role={p.role} size={96} />
            <span className="lineup__name">{p.name}</span>
            <span className="lineup__record">
              {p.role ?? NA}, {p.games} games
            </span>
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

/** The eight champions with the highest presence, as an icon grid. */
export function TournamentChampionTiles({ champions }: { champions: TournamentChampion[] }) {
  return (
    <ul className="champs">
      {champions.map((c, i) => (
        <li key={c.champion} style={{ ['--i' as string]: i }}>
          <Link to={`/champions/${encodeURIComponent(c.champion)}`} className="champs__tile">
            <ChampionIcon name={c.champion} size={56} />
            <span className="champs__name">{c.champion}</span>
            <span className="champs__stat">{percent(c.presence)} presence</span>
            <span className="champs__stat">
              {c.picks} {c.picks === 1 ? 'pick' : 'picks'}, {c.bans} {c.bans === 1 ? 'ban' : 'bans'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** `grouped`: the children are `<tbody>`s (one per day) instead of rows. */
function Table({ head, children, grouped = false }: { head: { label: string; left?: boolean }[]; children: React.ReactNode; grouped?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="pool">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: h.left ? 'left' : 'right' }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        {grouped ? children : <tbody>{children}</tbody>}
      </table>
    </div>
  )
}

/** `onTeam`, when given, adds an icon button per team that filters the match list to that team. */
export function StandingsTable({ standings, onTeam }: { standings: StandingRow[]; onTeam?: (team: string) => void }) {
  return (
    <Table head={[{ label: '#', left: true }, { label: 'Team', left: true }, { label: 'Series' }, { label: 'Games' }, { label: 'Game win %' }]}>
      {standings.map((r, i) => (
        <tr key={r.team}>
          <td className="pool__champ pool__role">{i + 1}</td>
          <td className="pool__champ">
            <span className="with-img">
              <TeamLogo name={r.team} size={26} />
              <Link to={teamLink(r.team)} className="pool__link">
                {r.team}
              </Link>
              {onTeam && (
                <button
                  type="button"
                  className="row-action"
                  aria-label={`Show matches for ${r.team}`}
                  title={`Show matches for ${r.team}`}
                  onClick={() => onTeam(r.team)}
                >
                  {CalendarIcon}
                </button>
              )}
            </span>
          </td>
          <td>{`${r.seriesWins}-${r.seriesLosses}`}</td>
          <td>{`${r.gameWins}-${r.gameLosses}`}</td>
          <td>{percent(r.gameWinRate)}</td>
        </tr>
      ))}
    </Table>
  )
}

const CalendarIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
)

const DATE_CELL_STYLE: CSSProperties = { textTransform: 'none', letterSpacing: 0, fontSize: 14 }

function MatchTeams({ s }: { s: SeriesRow }) {
  return (
    <>
      {[s.team1, s.team2].map((team, i) => (
        <span key={i}>
          {i > 0 && <span className="series__vs"> vs </span>}
          {team ? (
            <Link to={teamLink(team)} className={`pool__link${s.winner === team ? ' series__winner' : ''}`}>
              {team}
            </Link>
          ) : (
            'TBD'
          )}
        </span>
      ))}
    </>
  )
}

/** The heading row of one day's matches. */
function DayRow({ day, cols }: { day: string | null; cols: number }) {
  return (
    <tr className="day-row">
      <th scope="rowgroup" colSpan={cols}>
        {day ? dayLabel(day) : 'Date to be announced'}
      </th>
    </tr>
  )
}

/** Scheduled series under a heading per day, soonest first. They have no games yet, so there is nothing to open. */
export function UpcomingTable({ upcoming }: { upcoming: SeriesRow[] }) {
  return (
    <Table head={[{ label: 'Time', left: true }, { label: 'Match', left: true }]} grouped>
      {groupByDay(upcoming).map((g, i) => (
        <tbody key={`${g.day}-${i}`}>
          <DayRow day={g.day} cols={2} />
          {g.rows.map((s) => (
            <tr key={s.seriesId}>
              <td className="pool__champ pool__role" style={DATE_CELL_STYLE}>
                {matchClock(s.at)}
              </td>
              <td className="pool__champ">
                <MatchTeams s={s} />
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </Table>
  )
}

const ToggleChevron = (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
    <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Played series under a heading per day. Each series opens to show its games' bans and picks. `base` is the tournament's
 * API path. A series' games are fetched the first time it is opened and stay mounted (hidden) after, so closing and
 * reopening does not fetch again.
 */
export function ResultsTable({ results, base }: { results: SeriesRow[]; base: string }) {
  const uid = useId()
  // Present once a series has been opened; the value is whether it is open now.
  const [opened, setOpened] = useState<Record<number, boolean>>({})
  return (
    <Table head={[{ label: 'Time', left: true }, { label: 'Match', left: true }, { label: 'Score' }]} grouped>
      {groupByDay(results).map((g, i) => (
        <tbody key={`${g.day}-${i}`}>
          <DayRow day={g.day} cols={3} />
          {g.rows.map((s) => {
            const open = opened[s.seriesId] === true
            const detailId = `${uid}-${s.seriesId}`
            return (
              <Fragment key={s.seriesId}>
                <tr className={open ? 'is-open' : undefined}>
                  {/* The toggle leads the first column: on a phone the table scrolls sideways and the last column is off screen. */}
                  <td className="pool__champ pool__role" style={DATE_CELL_STYLE}>
                    <span className="date-cell">
                      <button
                        type="button"
                        className="row-toggle"
                        aria-expanded={open}
                        aria-controls={detailId}
                        aria-label={`Games: ${s.team1 ?? 'TBD'} vs ${s.team2 ?? 'TBD'}`}
                        onClick={() => setOpened((o) => ({ ...o, [s.seriesId]: !o[s.seriesId] }))}
                      >
                        {ToggleChevron}
                      </button>
                      {matchClock(s.at)}
                    </span>
                  </td>
                  <td className="pool__champ">
                    <MatchTeams s={s} />
                  </td>
                  <td>{s.score ?? NA}</td>
                </tr>
                {s.seriesId in opened && (
                  <tr id={detailId} className="games-row" hidden={!open}>
                    <td colSpan={3}>
                      <SeriesGames path={`${base}/series/${s.seriesId}`} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      ))}
    </Table>
  )
}

export function TournamentPlayersTable({ players }: { players: TournamentPlayer[] }) {
  return (
    <Table
      head={[
        { label: '#', left: true },
        { label: 'Player', left: true },
        { label: 'Team', left: true },
        { label: 'Role', left: true },
        { label: 'Games' },
        { label: 'Win rate' },
        { label: 'KDA' },
        { label: 'KP' },
        { label: 'DPM' },
      ]}
    >
      {players.map((p, i) => (
        <tr key={p.page}>
          <td className="pool__champ pool__role">{i + 1}</td>
          <td className="pool__champ">
            <span className="with-img">
              <PlayerPhoto page={p.page} name={p.name} role={p.role} size={28} />
              <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link">
                {p.name}
              </Link>
            </span>
          </td>
          <td className="pool__champ" style={{ fontWeight: 400 }}>
            {p.team ? (
              <Link to={teamLink(p.team)} className="pool__link">
                {p.team}
              </Link>
            ) : (
              NA
            )}
          </td>
          <td className="pool__champ pool__role">{p.role ?? NA}</td>
          <td>{p.games}</td>
          <td>{percent(p.winRate)}</td>
          <td>{decimal(p.kda)}</td>
          <td>{percent(p.killParticipation)}</td>
          <td>{whole(p.damagePerMin)}</td>
        </tr>
      ))}
    </Table>
  )
}

export function TournamentChampionsTable({ champions }: { champions: TournamentChampion[] }) {
  return (
    <Table head={[{ label: 'Champion', left: true }, { label: 'Presence' }, { label: 'Picks' }, { label: 'W-L' }, { label: 'Win rate' }, { label: 'Bans' }]}>
      {champions.map((c) => (
        <tr key={c.champion}>
          <td className="pool__champ">
            <span className="with-img">
              <ChampionIcon name={c.champion} size={28} />
              <Link to={`/champions/${encodeURIComponent(c.champion)}`} className="pool__link">
                {c.champion}
              </Link>
            </span>
          </td>
          <td>{percent(c.presence)}</td>
          <td>{c.picks}</td>
          <td>{c.picks > 0 ? `${c.wins}-${c.picks - c.wins}` : NA}</td>
          <td>{percent(c.winRate)}</td>
          <td>{c.bans}</td>
        </tr>
      ))}
    </Table>
  )
}
