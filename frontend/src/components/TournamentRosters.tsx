import { memo, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RostersResponse, TeamRoster } from '../api/types'
import { NA } from '../lib/format'
import { PlayerPhoto, TeamLogo } from './Images'

function RosterCard({ roster }: { roster: TeamRoster }) {
  return (
    <li className="roster">
      <h3 className="roster__team">
        <Link to={`/teams/${encodeURIComponent(roster.team)}`} className="roster__name with-img">
          <TeamLogo name={roster.team} size={28} />
          {roster.team}
        </Link>
      </h3>
      <ul className="roster__players">
        {roster.players.map((p) => (
          <li key={p.page}>
            <Link to={`/players/${encodeURIComponent(p.page)}`} className="roster__player">
              <PlayerPhoto page={p.page} name={p.name} role={p.role} size={32} />
              <span className="roster__who">{p.name}</span>
              <span className="roster__role">{p.role ?? NA}</span>
              <span className="roster__games">
                {p.games}
                <span className="sr-only"> {p.games === 1 ? 'game' : 'games'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

/** How many cards make one row of the grid: the columns its width gives it, kept up to date as the page is resized. */
function useColumns(ref: React.RefObject<HTMLUListElement | null>): number {
  const [columns, setColumns] = useState(1)
  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid) return
    const measure = () => setColumns(Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [ref])
  return columns
}

/**
 * Collapsed, the first row of cards (the best teams by standing); expanded, every team. Cards past the first row are not
 * rendered while collapsed, so they cannot be tabbed into. Memoised: the page re-renders on every sibling fetch, while this
 * data never changes.
 */
const TournamentRosters = memo(function TournamentRosters({ data }: { data: RostersResponse }) {
  const [expanded, setExpanded] = useState(false)
  const gridRef = useRef<HTMLUListElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const gridId = useId()
  const columns = useColumns(gridRef)
  const total = data.teams.length
  const canToggle = total > columns
  const shown = expanded || !canToggle ? data.teams : data.teams.slice(0, columns)

  const toggle = () => {
    const collapsing = expanded
    setExpanded(!expanded)
    // Collapsing a long grid moves the button up the page; bring it back into view if it was left off screen.
    if (collapsing) requestAnimationFrame(() => toggleRef.current?.scrollIntoView({ block: 'nearest' }))
  }

  return (
    <>
      <ul id={gridId} ref={gridRef} className="rosters">
        {shown.map((r) => (
          <RosterCard key={r.team} roster={r} />
        ))}
      </ul>
      {canToggle && (
        <button ref={toggleRef} type="button" className="btn-reset btn-reset--inline" aria-expanded={expanded} aria-controls={gridId} onClick={toggle}>
          {expanded ? 'Show fewer teams' : `Show all ${total} teams`}
        </button>
      )}
    </>
  )
})

export default TournamentRosters

/** Static, so built once: made from the real card classes so it reserves about the height the cards will take. */
const SKELETON = (
  <ul className="rosters" aria-busy="true">
    {[0, 1, 2, 3].map((i) => (
      <li key={i} className="roster">
        <div className="skeleton" style={{ width: 150, height: 28 }} />
        <ul className="roster__players">
          {[0, 1, 2, 3, 4].map((j) => (
            <li key={j} className="roster__player">
              <div className="skeleton" style={{ width: 32, height: 32 }} />
              <div className="skeleton" style={{ width: 110, height: 18 }} />
            </li>
          ))}
        </ul>
      </li>
    ))}
  </ul>
)

export const TournamentRostersSkeleton = () => SKELETON
