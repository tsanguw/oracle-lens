import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesGame, SeriesGamesResponse, SeriesSide } from '../api/types'
import { useApi } from '../api/useApi'
import { duration, NA } from '../lib/format'
import ErrorState from './ErrorState'
import { ChampionIcon, TeamLogo } from './Images'

const SIDE_LABEL = { blue: 'Blue side', red: 'Red side' } as const

function Side({ side }: { side: SeriesSide }) {
  return (
    <div className={`gside${side.win ? ' gside--win' : ''}`}>
      <div className="gside__head">
        <TeamLogo name={side.team} size={24} />
        <Link to={`/teams/${encodeURIComponent(side.team)}`} className="pool__link gside__team">
          {side.team}
        </Link>
        <span className="gside__label">{SIDE_LABEL[side.side]}</span>
        {side.win && <span className="gside__win">Win</span>}
      </div>
      {side.bans.length > 0 && (
        <ul className="gside__bans" aria-label="Bans">
          {side.bans.map((champion, i) => (
            <li key={i} title={champion}>
              <ChampionIcon name={champion} size={28} />
              <span className="sr-only">{champion}</span>
            </li>
          ))}
        </ul>
      )}
      {side.picks.length > 0 && (
        <ul className="gside__picks" aria-label="Picks">
          {side.picks.map((p) => (
            <li key={p.page} className="gpick">
              <span className="gpick__order">
                {p.pickOrder != null && (
                  <>
                    <span className="sr-only">Pick </span>
                    {p.pickOrder}
                  </>
                )}
              </span>
              <ChampionIcon name={p.champion} size={32} />
              <span className="gpick__who">
                <span className="gpick__champ">{p.champion}</span>
                <Link to={`/players/${encodeURIComponent(p.page)}`} className="pool__link gpick__player">
                  {p.player}
                </Link>
              </span>
              <span className="gpick__role">{p.role ?? NA}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Game({ game }: { game: SeriesGame }) {
  const hasDraft = game.sides.some((s) => s.bans.length > 0 || s.picks.length > 0)
  return (
    <div className="game">
      <h4 className="game__title">
        Game {game.number}
        <span className="game__meta">
          {duration(game.lengthSec)}
          {game.patch && ` · Patch ${game.patch}`}
        </span>
      </h4>
      <div className="game__sides">
        {game.sides.map((s) => (
          <Side key={s.side} side={s} />
        ))}
      </div>
      {!hasDraft && <p className="section__note">Draft data isn’t available for this game.</p>}
    </div>
  )
}

/** The bans and picks of every game in a series. Mounted the first time its row is opened, so it fetches on demand. */
const SeriesGames = memo(function SeriesGames({ path }: { path: string }) {
  const { data, error, reload } = useApi<SeriesGamesResponse>(path)
  if (error) return <ErrorState message={error.message} onRetry={reload} heading="Could not load the games" level={4} />
  if (!data) {
    return (
      <div className="games games--loading skeleton" role="status" aria-busy="true">
        <span className="sr-only">Loading games…</span>
      </div>
    )
  }
  if (data.games.length === 0) return <p className="section__note">No games recorded for this series.</p>
  return (
    <div className="games">
      {data.games.map((g) => (
        <Game key={g.gameId} game={g} />
      ))}
    </div>
  )
})

export default SeriesGames
