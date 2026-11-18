import { ChampionIcon } from './Images'
import NamePicker from './NamePicker'

interface Props {
  /** Every champion in the game, in any order. */
  champions: string[]
  /** The ones that were picked or banned in the event; the rest are greyed out but can still be chosen. */
  inEvent: Set<string>
  /** The chosen champion, or an empty string for none. */
  value: string
  onChange: (champion: string) => void
}

const championIcon = (name: string, size: number) => <ChampionIcon name={name} size={size} />

/** The tournament page's champion dropdown: a `NamePicker` with champion icons, in alphabetical order. */
export default function ChampionSelect({ champions, inEvent, value, onChange }: Props) {
  const names = [...champions].sort((a, b) => a.localeCompare(b))
  return (
    <NamePicker
      names={names}
      value={value}
      onChange={onChange}
      label="Champion"
      allLabel="No champion"
      placeholder="Choose a champion"
      listLabel="Champions"
      icon={championIcon}
      dimmed={(name) => !inEvent.has(name)}
      dimNote=", not picked or banned in this event"
    />
  )
}
