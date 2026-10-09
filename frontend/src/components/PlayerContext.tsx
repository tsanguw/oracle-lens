import { Link } from 'react-router-dom'
import type { PlayerContextResponse } from '../api/types'
import { ContextPanel, ContextSkeleton, ContextStrip, EventsPanel, RosterList, SchedulePanel } from './LinkedInfo'

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
      <EventsPanel events={data.events} />
      <SchedulePanel upcoming={data.upcoming} results={data.results} />
    </ContextStrip>
  )
}
