import { TeamLogo } from './Images'
import NamePicker from './NamePicker'

interface Props {
  teams: string[]
  /** The chosen team, or an empty string for all of them. */
  value: string
  onChange: (team: string) => void
}

const teamIcon = (name: string, size: number) => <TeamLogo name={name} size={size} />

/** The match list's Team dropdown: a `NamePicker` with team logos. */
export default function TeamPicker({ teams, value, onChange }: Props) {
  return <NamePicker names={teams} value={value} onChange={onChange} label="Team" allLabel="All teams" listLabel="Teams" icon={teamIcon} />
}
