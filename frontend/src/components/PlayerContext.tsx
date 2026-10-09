import { Link } from 'react-router-dom'
import type { PlayerContextResponse } from '../api/types'
import { ContextPanel, ContextSkeleton, ContextStrip, EventList, MatchList, RosterList } from './LinkedInfo'

export default function PlayerContext({ data }: { data: PlayerContextResponse | null }) {
  if (!data) return <ContextSkeleton />
  if (!data.team) return null
  const { team } = data
  const lastSeen = team.lastPlayed
    ? new Date(team.lastPlayed).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  return (
    <ContextStrip>
      <ContextPanel
        title={team.isCurrent ? 'Current team' : 'Last team'}
        note={team.isCurrent ? undefined : `No games since ${lastSeen}. This may no longer be their team.`}
      >
        <Link to={`/teams/${encodeURIComponent(team.name)}`} className="ctx__team">
          <span className="ctx__team-name">{team.name}</span>
          {team.league && <span className="tag tag--small">{team.league}</span>}
        </Link>
        <h3 className="ctx__sub">Roster</h3>
        <RosterList roster={data.roster} />
      </ContextPanel>

      <ContextPanel title={data.events.some((e) => e.status === 'In progress') ? 'Current events' : 'Recent events'}>
        {data.events.length > 0 ? <EventList events={data.events} /> : <p className="ctx__empty">No recent events.</p>}
      </ContextPanel>

      <ContextPanel title="Schedule">
        <h3 className="ctx__sub">Upcoming</h3>
        {data.upcoming.length > 0 ? (
          <MatchList matches={data.upcoming} />
        ) : (
          <p className="ctx__empty">No upcoming matches scheduled.</p>
        )}
        {data.results.length > 0 && (
          <>
            <h3 className="ctx__sub">Recent results</h3>
            <MatchList matches={data.results.slice(0, 3)} result />
          </>
        )}
      </ContextPanel>
    </ContextStrip>
  )
}
