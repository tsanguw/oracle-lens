import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ContextEvent, ContextMatch, RosterPlayer } from '../api/types'
import { dateRange, matchTime, placeLabel } from '../lib/format'
import { PlayerPhoto } from './Images'

/*
 * Building blocks for the "related info" strip under the header of every detail page
 * (player, team, champion, tournament). Every entity named here links to its own page.
 */

const STORAGE_KEY = 'related-info-hidden'

/** Remembered per browser (never required): storage can be blocked or throw, so every access is guarded. */
const readHidden = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Wraps the related-info panels with a show/hide toggle. The choice is shared by every detail page,
 * and the "Related info" bar stays visible while the panels are hidden.
 */
export function ContextStrip({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readHidden)
  const toggle = () => {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* the toggle still works for this visit */
    }
  }
  return (
    <div className="container ctx-wrap">
      <div className="ctx-bar">
        <span className="ctx-bar__summary">Related info</span>
        <button type="button" className="ctx-bar__toggle" aria-label={`${hidden ? 'Show' : 'Hide'} related info`} aria-expanded={!hidden} aria-controls="related-info" onClick={toggle}>
          {hidden ? 'Show' : 'Hide'}
          <span aria-hidden="true"> {hidden ? '▾' : '▴'}</span>
        </button>
      </div>
      <div id="related-info" className="ctx" hidden={hidden}>
        {children}
      </div>
    </div>
  )
}

export function ContextPanel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="ctx__panel" aria-label={title}>
      <h2 className="ctx__title">{title}</h2>
      {children}
      {note && <p className="ctx__note">{note}</p>}
    </section>
  )
}

export function ContextSkeleton() {
  return (
    <div className="container ctx-wrap" aria-busy="true">
      <div className="ctx">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ctx__panel skeleton" style={{ height: 230 }} />
      ))}
      </div>
    </div>
  )
}

/** "Current events" while something is running, otherwise the most recent events. */
export function EventsPanel({ events }: { events: ContextEvent[] }) {
  return (
    <ContextPanel title={events.some((e) => e.status === 'In progress') ? 'Current events' : 'Recent events'}>
      {events.length > 0 ? <EventList events={events} /> : <p className="ctx__empty">No recent events.</p>}
    </ContextPanel>
  )
}

/** Upcoming series plus the last few results, from the team's side. */
export function SchedulePanel({ upcoming, results }: { upcoming: ContextMatch[]; results: ContextMatch[] }) {
  return (
    <ContextPanel title="Schedule">
      <h3 className="ctx__sub">Upcoming</h3>
      {upcoming.length > 0 ? <MatchList matches={upcoming} /> : <p className="ctx__empty">No upcoming matches scheduled.</p>}
      {results.length > 0 && (
        <>
          <h3 className="ctx__sub">Recent results</h3>
          <MatchList matches={results.slice(0, 3)} result />
        </>
      )}
    </ContextPanel>
  )
}

export function RosterList({ roster }: { roster: RosterPlayer[] }) {
  const starters = roster.filter((p) => p.starter)
  const subs = roster.filter((p) => !p.starter)
  const row = (p: RosterPlayer) => (
    <li key={p.page}>
      <Link to={`/players/${encodeURIComponent(p.page)}`} className={`ctx__row${p.isViewed ? ' is-viewed' : ''}`}>
        <span className="ctx__role">{p.role ?? '—'}</span>
        <span className="ctx__name with-img">
          <PlayerPhoto page={p.page} name={p.name} role={p.role} size={26} />
          {p.name}
        </span>
        <span className="ctx__meta">{p.games} games</span>
      </Link>
    </li>
  )
  return (
    <>
      <ul className="ctx__list">{starters.map(row)}</ul>
      {subs.length > 0 && (
        <>
          <h3 className="ctx__sub">Substitutes</h3>
          <ul className="ctx__list">{subs.map(row)}</ul>
        </>
      )}
    </>
  )
}

export function EventList({ events }: { events: ContextEvent[] }) {
  return (
    <ul className="ctx__list">
      {events.map((e) => (
        <li key={e.id}>
          <Link to={`/tournaments/${e.id}`} className="ctx__event">
            <span className="ctx__event-top">
              <span className="tag tag--small">{e.league}</span>
              {e.status === 'Completed' && e.placement ? (
                <span
                  className={`badge badge--place${e.placement.place === '1' ? ' badge--first' : ''}`}
                  title={`Finished ${placeLabel(e.placement.place)}${e.placement.group ? ` in ${e.placement.group}` : ''}`}
                >
                  {placeLabel(e.placement.place)}
                </span>
              ) : (
                <span className={`badge${e.status === 'In progress' ? ' badge--live' : ''}`}>{e.status}</span>
              )}
            </span>
            <span className="ctx__name">{e.name}</span>
            <span className="ctx__meta">
              {dateRange(e.startDate, e.endDate)}
              {e.team ? `, ${e.team}` : ''}
              {e.placement?.group ? `, ${e.placement.group}` : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function MatchList({ matches, result }: { matches: ContextMatch[]; result?: boolean }) {
  return (
    <ul className="ctx__list">
      {matches.map((m) => (
        <li key={m.seriesId}>
          <Link to={`/tournaments/${m.tournamentId}`} className="ctx__match">
            <span>
              <span className="ctx__meta">vs.</span> <span className="ctx__name">{m.opponent ?? 'TBD'}</span>
            </span>
            {result ? (
              <span className={`ctx__result ${m.won ? 'is-win' : 'is-loss'}`}>
                {m.won ? 'W' : 'L'} {m.score ?? ''}
              </span>
            ) : (
              <span className="ctx__meta">{m.bestOf ? `Bo${m.bestOf}` : ''}</span>
            )}
            <span className="ctx__meta ctx__match-when">
              {matchTime(m.scheduledAt)} · {m.tournament}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
