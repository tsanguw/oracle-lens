import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ChampionListRow, TeamListRow, TournamentListRow } from '../api/types'
import { dateRange, decimal, duration, goldDiff, percent, shortTeam } from '../lib/format'
import { ChampionIcon, TeamLogo } from './Images'

interface Card {
  key: string
  to: string
  rank: number
  kicker: ReactNode
  image: ReactNode
  name: string
  sub: string
  stats: { label: string; value: string }[]
}

/** The leaders of a list as three cards. The stat the list is sorted by comes first, in gold. */
function Cards({ cards, label }: { cards: Card[]; label: string }) {
  return (
    <ol className="lineup lineup--podium" aria-label={label}>
      {cards.map((c, i) => (
        <li key={c.key} style={{ ['--i' as string]: i }}>
          <Link to={c.to} className={`lineup__card${i === 0 ? ' is-first' : ''}`}>
            <span className="lineup__role with-img">
              <span className="podium__rank">{c.rank}</span>
              {c.kicker}
            </span>
            {c.image}
            <span className="lineup__name">{c.name}</span>
            <span className="lineup__record">{c.sub}</span>
            <dl className="lineup__stats">
              {c.stats.map((s, n) => (
                <div key={s.label} className={n === 0 ? 'is-sorted' : undefined}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          </Link>
        </li>
      ))}
    </ol>
  )
}

type Stat<T> = Record<string, { label: string; value: (r: T) => string }>

/** The sorted stat first, then the first two of `fallback` that are not it. */
function pick<T>(all: Stat<T>, sort: string, fallback: string[]): string[] {
  return [sort, ...fallback.filter((k) => k !== sort)].filter((k) => k in all).slice(0, 3)
}

const TEAM_STATS: Stat<TeamListRow> = {
  winRate: { label: 'Win rate', value: (r) => percent(r.winRate) },
  games: { label: 'Games', value: (r) => String(r.games) },
  goldDiff: { label: 'Gold diff', value: (r) => goldDiff(r.goldDiff).replace(' gold', '') },
  killsPerGame: { label: 'Kills/game', value: (r) => decimal(r.killsPerGame) },
  towersPerGame: { label: 'Towers/game', value: (r) => decimal(r.towersPerGame) },
  avgGameLengthSec: { label: 'Avg game', value: (r) => duration(r.avgGameLengthSec) },
}

export function TeamPodium({ rows, sort }: { rows: TeamListRow[]; sort: string }) {
  const keys = pick(TEAM_STATS, sort, ['winRate', 'goldDiff', 'games'])
  return (
    <Cards
      label={`Top three by ${TEAM_STATS[sort]?.label ?? 'win rate'}`}
      cards={rows.map((r) => ({
        key: r.name,
        to: `/teams/${encodeURIComponent(r.name)}`,
        rank: r.rank,
        kicker: r.league ?? 'INTL',
        image: <TeamLogo name={r.name} size={96} />,
        name: shortTeam(r.name),
        sub: `${r.wins}-${r.losses} in ${r.games} games`,
        stats: keys.map((k) => ({ label: TEAM_STATS[k].label, value: TEAM_STATS[k].value(r) })),
      }))}
    />
  )
}

const CHAMPION_STATS: Stat<ChampionListRow> = {
  presence: { label: 'Presence', value: (r) => percent(r.presence, 1) },
  games: { label: 'Games', value: (r) => String(r.games) },
  winRate: { label: 'Win rate', value: (r) => percent(r.winRate) },
  pickRate: { label: 'Pick rate', value: (r) => percent(r.pickRate, 1) },
  banRate: { label: 'Ban rate', value: (r) => percent(r.banRate, 1) },
  kda: { label: 'KDA', value: (r) => decimal(r.kda) },
}

export function ChampionPodium({ rows, sort }: { rows: ChampionListRow[]; sort: string }) {
  const keys = pick(CHAMPION_STATS, sort, ['presence', 'winRate', 'pickRate'])
  return (
    <Cards
      label={`Top three by ${CHAMPION_STATS[sort]?.label ?? 'presence'}`}
      cards={rows.map((r) => ({
        key: r.name,
        to: `/champions/${encodeURIComponent(r.name)}`,
        rank: r.rank,
        kicker: r.role ?? 'Any role',
        image: <ChampionIcon name={r.name} size={96} />,
        name: r.name,
        sub: `${r.wins}-${r.games - r.wins} in ${r.games} games`,
        stats: keys.map((k) => ({ label: CHAMPION_STATS[k].label, value: CHAMPION_STATS[k].value(r) })),
      }))}
    />
  )
}

/** Events running right now, ahead of the full list: who is leading and since when. */
export function LiveNow({ events }: { events: TournamentListRow[] }) {
  return (
    <section className="live" aria-label="In progress now">
      {events.map((t) => (
        <Link key={t.id} to={`/tournaments/${t.id}`} className="lineup__card is-first live__card">
          <span className="lineup__role with-img">
            <span className="badge badge--live">In progress</span>
            {t.league}
          </span>
          <span className="lineup__name live__name">{t.name}</span>
          <span className="lineup__record">{dateRange(t.startDate, t.endDate)}</span>
          {t.standingTeam && (
            <span className="live__lead with-img">
              <TeamLogo name={t.standingTeam} size={32} />
              <span>
                <span className="live__label">{t.standingLabel}</span>
                <span className="live__team">{shortTeam(t.standingTeam)}</span>
              </span>
            </span>
          )}
        </Link>
      ))}
    </section>
  )
}
