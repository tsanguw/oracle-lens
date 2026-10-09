import { Link } from 'react-router-dom'
import type {
  SeriesRow,
  StandingRow,
  TournamentChampion,
  TournamentContextResponse,
  TournamentPlayer,
  TournamentResponse,
  TournamentSummary,
} from '../api/types'
import { dateRange, decimal, duration, matchTime, NA, percent, whole } from '../lib/format'
import { ContextPanel, ContextSkeleton, ContextStrip, EventList } from './LinkedInfo'

const teamLink = (name: string) => `/teams/${encodeURIComponent(name)}`

export function TournamentHeader({ data }: { data: TournamentResponse }) {
  const { tournament: t, summary } = data
  const leagueTag = t.league ?? (t.isInternational ? 'INTL' : t.leagues.join(' / ') || null)
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__text">
          <div className="tags">
            {leagueTag && <span className="tag tag--gold">{leagueTag}</span>}
            {t.stage && <span className="tag">{t.stage}</span>}
            <span className={`badge${t.status === 'In progress' ? ' badge--live' : ''}`}>{t.status}</span>
          </div>
          <h1 className="hero__name hero__name--team">{t.name}</h1>
          <span className="hero__team">{dateRange(t.startDate, t.endDate)}</span>
        </div>
        {summary?.standingTeam && (
          <div className="showing">
            <span className="showing__eyebrow">{summary.standingLabel}</span>
            <Link to={teamLink(summary.standingTeam)} className="showing__label">
              {summary.standingTeam}
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

export function TournamentHeaderSkeleton() {
  return (
    <section className="hero" aria-busy="true">
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
                  <Link key={i} to={teamLink(team)} className={`series__team${s.winner === team ? ' is-winner' : ''}`}>
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
                  <span className="ctx__name">{t.team}</span>
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
        <h3 className="ctx__sub">Upcoming</h3>
        {data.upcoming.length > 0 ? <SeriesList series={data.upcoming} /> : <p className="ctx__empty">No upcoming matches scheduled.</p>}
        {data.results.length > 0 && (
          <>
            <h3 className="ctx__sub">Latest results</h3>
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

export function TournamentTiles({ summary }: { summary: TournamentSummary }) {
  const tiles = [
    { label: 'Games', value: String(summary.games), sub: 'Played' },
    { label: 'Series', value: String(summary.series), sub: 'With games played' },
    { label: 'Teams', value: String(summary.teams), sub: 'Took part' },
    { label: 'Avg game', value: duration(summary.avgGameLengthSec), sub: 'Game length' },
    { label: 'Blue side', value: percent(summary.blueWinRate), sub: 'Win rate' },
    { label: 'Kills / game', value: decimal(summary.killsPerGame), sub: 'Both teams combined' },
  ]
  return (
    <>
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <span className="tile__label">{t.label}</span>
            <span className="tile__value">{t.value}</span>
            <span className="tile__sub">{t.sub}</span>
          </div>
        ))}
      </div>
      {summary.patches.length > 0 && <p className="section__note">Patches: {summary.patches.join(', ')}</p>}
    </>
  )
}

function Table({ head, children }: { head: { label: string; left?: boolean }[]; children: React.ReactNode }) {
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
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function StandingsTable({ standings }: { standings: StandingRow[] }) {
  return (
    <Table head={[{ label: '#', left: true }, { label: 'Team', left: true }, { label: 'Series' }, { label: 'Games' }, { label: 'Game win rate' }]}>
      {standings.map((r, i) => (
        <tr key={r.team}>
          <td className="pool__champ pool__role">{i + 1}</td>
          <td className="pool__champ">
            <Link to={teamLink(r.team)} className="pool__link">
              {r.team}
            </Link>
          </td>
          <td>{`${r.seriesWins}-${r.seriesLosses}`}</td>
          <td>{`${r.gameWins}-${r.gameLosses}`}</td>
          <td>{percent(r.gameWinRate)}</td>
        </tr>
      ))}
    </Table>
  )
}

export function ResultsTable({ results }: { results: SeriesRow[] }) {
  return (
    <Table head={[{ label: 'Date', left: true }, { label: 'Match', left: true }, { label: 'Score' }]}>
      {results.map((s) => (
        <tr key={s.seriesId}>
          <td className="pool__champ pool__role" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
            {matchTime(s.at)}
          </td>
          <td className="pool__champ">
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
          </td>
          <td>{s.score ?? NA}</td>
        </tr>
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
            <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link">
              {p.name}
            </Link>
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
            <Link to={`/champions/${encodeURIComponent(c.champion)}`} className="pool__link">
              {c.champion}
            </Link>
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
