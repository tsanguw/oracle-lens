import { useParams } from 'react-router-dom'
import PlayerPage from './PlayerPage'
import TeamPage from './TeamPage'

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

export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="main container">
      <h1 className="stub__title">{title}</h1>
      <p className="stub__text">This page is planned for a later milestone.</p>
    </main>
  )
}
