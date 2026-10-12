import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { PlayerTeamHistoryResponse, TeamStint } from '../api/types'
import { shortTeam, stintLength, stintSpan } from '../lib/format'
import { TeamLogo } from './Images'

/** How many of the newest stints show before the rest fold away. */
const SHOWN = 8

function StintRow({ stint }: { stint: TeamStint }) {
  const name = shortTeam(stint.team)
  return (
    <li className="hist__row">
      <div className="hist__team">
        <TeamLogo name={stint.teamPage ?? stint.team} size={32} />
        {stint.teamPage ? (
          <Link to={`/teams/${encodeURIComponent(stint.teamPage)}`} className="hist__name">
            {name}
          </Link>
        ) : (
          <span className="hist__name">{name}</span>
        )}
      </div>
      <div className="hist__meta">
        {stint.region && <span className="tag tag--small">{stint.region}</span>}
        {stint.role && <span>{stint.role}</span>}
        {stint.modifier && <span className="badge">{stint.modifier}</span>}
        {stint.loan && <span className="badge">Loan</span>}
        {stint.inactive && <span className="badge">Inactive</span>}
      </div>
      <div className="hist__when">
        <span className="hist__dates">
          {stintSpan(stint.start, stint.end, stint.endUnknown)}
          {stint.endUnknown && <span className="sr-only"> (end date unknown)</span>}
        </span>
        {!stint.endUnknown && <span className="hist__len">{stintLength(stint.start, stint.end)}</span>}
      </div>
    </li>
  )
}

/** Memoised: the page re-renders on every filter change and every sibling fetch, while this data never changes. */
const PlayerTeamHistory = memo(function PlayerTeamHistory({ data }: { data: PlayerTeamHistoryResponse }) {
  const [recent, earlier] = [data.stints.slice(0, SHOWN), data.stints.slice(SHOWN)]
  return (
    <>
      <ul className="hist">
        {recent.map((s, i) => (
          <StintRow key={`${s.team}-${s.start}-${i}`} stint={s} />
        ))}
      </ul>
      {earlier.length > 0 && (
        <details className="more">
          <summary>{earlier.length} earlier {earlier.length === 1 ? 'stint' : 'stints'}</summary>
          <ul className="hist">
            {earlier.map((s, i) => (
              <StintRow key={`${s.team}-${s.start}-${i}`} stint={s} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
})

export default PlayerTeamHistory

/** Static, so built once: made from the real row classes so it reserves about the height the list will take. */
const SKELETON = (
  <ul className="hist" aria-busy="true">
    {[0, 1, 2, 3].map((i) => (
      <li key={i} className="hist__row">
        <div className="hist__team">
          <div className="skeleton" style={{ width: 32, height: 32 }} />
          <div className="skeleton" style={{ width: 140, height: 24 }} />
        </div>
        <div className="hist__meta">
          <div className="skeleton" style={{ width: 90, height: 18 }} />
        </div>
        <div className="hist__when">
          <div className="skeleton" style={{ width: 150, height: 20 }} />
          <div className="skeleton" style={{ width: 70, height: 16 }} />
        </div>
      </li>
    ))}
  </ul>
)

export const PlayerTeamHistorySkeleton = () => SKELETON
