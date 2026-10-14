import TeamPicker from './TeamPicker'

interface Props {
  teams: string[]
  /** Empty string when no team is chosen. */
  team: string
  onChange: (team: string) => void
  /** Matches left after filtering, and in all; the count is only announced while a team is chosen. */
  shown: number
  total: number
}

/** Sits in the heading row of the match list: pick a team to see all of its matches; the list below is grouped by day. */
export default function ResultsFilters({ teams, team, onChange, shown, total }: Props) {
  return (
    <div className="matches__tools" role="group" aria-label="Filter matches">
      <span className="matches__count" role="status">
        {team ? `${shown} of ${total} matches` : ''}
      </span>
      {team && (
        <button type="button" className="matches__clear" onClick={() => onChange('')}>
          Clear filter
        </button>
      )}
      <TeamPicker teams={teams} value={team} onChange={onChange} />
    </div>
  )
}
