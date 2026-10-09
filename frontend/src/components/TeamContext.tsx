import type { TeamContextResponse } from '../api/types'
import { ContextPanel, ContextSkeleton, ContextStrip, EventsPanel, RosterList, SchedulePanel } from './LinkedInfo'

/** Related info for a team page: its latest roster, running events and schedule. */
export default function TeamContext({ data }: { data: TeamContextResponse | null }) {
  if (!data) return <ContextSkeleton />
  return (
    <ContextStrip>
      <ContextPanel title="Roster" note="Everyone who played in the team’s most recent event.">
        {data.roster.length > 0 ? <RosterList roster={data.roster} /> : <p className="ctx__empty">No games recorded.</p>}
      </ContextPanel>
      <EventsPanel events={data.events} />
      <SchedulePanel upcoming={data.upcoming} results={data.results} />
    </ContextStrip>
  )
}
