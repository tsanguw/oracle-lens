import { ChampionIcon } from './Images'
import NamePicker from './NamePicker'

interface Props {
  /** The champions of the event, in any order. */
  champions: string[]
  /** The chosen champion, or an empty string for none. */
  value: string
  onChange: (champion: string) => void
}

const championIcon = (name: string, size: number) => <ChampionIcon name={name} size={size} />

/** The tournament page's champion dropdown: a `NamePicker` with champion icons, in alphabetical order. */
export default function ChampionSelect({ champions, value, onChange }: Props) {
  const names = [...champions].sort((a, b) => a.localeCompare(b))
  return <NamePicker names={names} value={value} onChange={onChange} label="Champion" allLabel="All champions" listLabel="Champions in this event" icon={championIcon} />
}
