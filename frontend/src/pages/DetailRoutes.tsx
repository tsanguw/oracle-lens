import { useParams } from 'react-router-dom'
import ChampionPage from './ChampionPage'
import ComparePage from './ComparePage'
import PlayerPage from './PlayerPage'
import TeamPage from './TeamPage'
import TournamentPage from './TournamentPage'

/** Remounts the page per player so a previous player's data never flashes. */
export function PlayerRoute() {
  const { name = '' } = useParams()
  return <PlayerPage key={name} name={name} />
}

/** Remounts the page per team, for the same reason as the player route. */
export function TeamRoute() {
  const { name = '' } = useParams()
  return <TeamPage key={name} name={name} />
}

/** Remounts the page per champion so one champion's data never flashes on another. */
export function ChampionRoute() {
  const { name = '' } = useParams()
  return <ChampionPage key={name} name={name} />
}

/** Remounts the page per tournament so one event's data never flashes on another. */
export function TournamentRoute() {
  const { id = '' } = useParams()
  return <TournamentPage key={id} id={id} />
}

/** Remounts per pair so one comparison's numbers never flash on another; the second subject is optional (the picker shows). */
export function ComparePlayersRoute() {
  const { a = null, b = null } = useParams()
  return <ComparePage key={`${a}/${b}`} kind="players" a={a} b={b} />
}

export function CompareTeamsRoute() {
  const { a = null, b = null } = useParams()
  return <ComparePage key={`${a}/${b}`} kind="teams" a={a} b={b} />
}
