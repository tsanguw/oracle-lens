import { useSearchParams } from 'react-router-dom'
import type { ChampionsResponse, FiltersResponse, PlayerResponse } from '../api/types'
import { useApi } from '../api/useApi'
import ChampionPoolTable, { ChampionPoolSkeleton } from '../components/ChampionPoolTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import PlayerHeader, { PlayerHeaderSkeleton } from '../components/PlayerHeader'
import StatTiles, { StatTilesSkeleton } from '../components/StatTiles'

export default function PlayerPage({ name }: { name: string }) {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const base = `/api/players/${encodeURIComponent(name)}`

  const player = useApi<PlayerResponse>(`${base}${qs}`)
  const champions = useApi<ChampionsResponse>(`${base}/champions${qs}`)
  const filters = useApi<FiltersResponse>('/api/filters')

  const reset = () => setParams(new URLSearchParams())

  if (player.error?.status === 404) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Player not found</h1>
          <p className="empty__text">We don’t have a player called “{name}”. Check the spelling.</p>
        </div>
      </main>
    )
  }
  if (player.error) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Something went wrong</h1>
          <p className="empty__text">{player.error.message}. Try again in a moment.</p>
        </div>
      </main>
    )
  }

  const data = player.data
  const stale = player.loading || champions.loading

  return (
    <>
      {data ? <PlayerHeader data={data} /> : <PlayerHeaderSkeleton />}
      <FilterBar
        params={params}
        onChange={(next) => setParams(next)}
        options={filters.data}
        range={data?.range ?? null}
      />
      <main className="main container" style={{ opacity: data && stale ? 0.6 : 1 }}>
        {data?.empty ? (
          <EmptyState onReset={reset} />
        ) : (
          <>
            <section aria-labelledby="overview" className="section">
              <h2 id="overview" className="section__title">
                Overview
              </h2>
              {data?.summary ? <StatTiles summary={data.summary} /> : <StatTilesSkeleton />}
            </section>

            <section aria-labelledby="pool" className="section">
              <div className="section__head">
                <h2 id="pool" className="section__title">
                  Champion pool
                </h2>
                <span className="section__note">
                  Grayed rows have fewer than 5 games and are excluded from winrate rankings
                </span>
              </div>
              {champions.data ? (
                champions.data.empty ? (
                  <EmptyState onReset={reset} />
                ) : (
                  <ChampionPoolTable champions={champions.data.champions} />
                )
              ) : (
                <ChampionPoolSkeleton />
              )}
            </section>
          </>
        )}
      </main>
    </>
  )
}
