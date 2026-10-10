import { useSearchParams } from 'react-router-dom'
import type {
  ChampionMatchupsResponse,
  ChampionsResponse,
  FiltersResponse,
  PlayerContextResponse,
  PlayerMatchupsResponse,
  PlayerResponse,
  TargetBansResponse,
} from '../api/types'
import { useApi } from '../api/useApi'
import ChampionPoolTable, { ChampionFeatured, ChampionPoolSkeleton } from '../components/ChampionPoolTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import MatchupPanel from '../components/MatchupPanel'
import PlayerContext from '../components/PlayerContext'
import PlayerHeader, { PlayerHeaderSkeleton } from '../components/PlayerHeader'
import StatTiles, { StatTilesSkeleton } from '../components/StatTiles'
import TargetBans, { TargetBansSkeleton } from '../components/TargetBans'
import { opposingLabel } from '../lib/format'
import { ChampionIcon, PlayerPhoto } from '../components/Images'
import { usePageTitle } from '../lib/usePageTitle'
import ErrorState from '../components/ErrorState'

export default function PlayerPage({ name }: { name: string }) {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const base = `/api/players/${encodeURIComponent(name)}`

  const player = useApi<PlayerResponse>(`${base}${qs}`)
  const champions = useApi<ChampionsResponse>(`${base}/champions${qs}`)
  const vsPlayers = useApi<PlayerMatchupsResponse>(`${base}/matchups/players${qs}`)
  const vsChampions = useApi<ChampionMatchupsResponse>(`${base}/matchups/champions${qs}`)
  const bans = useApi<TargetBansResponse>(`${base}/target-bans${qs}`)
  const context = useApi<PlayerContextResponse>(`${base}/context`)
  const filters = useApi<FiltersResponse>('/api/filters')
  usePageTitle(player.data?.player.displayName ?? name)

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
        <ErrorState message={player.error.message} onRetry={player.reload} level={1} />
      </main>
    )
  }

  const data = player.data
  const stale =
    player.loading || champions.loading || vsPlayers.loading || vsChampions.loading || bans.loading

  return (
    <>
      {data ? <PlayerHeader data={data} champions={champions.data?.champions} results={context.data?.results} /> : <PlayerHeaderSkeleton />}
      <PlayerContext data={context.data} />
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
                  Grayed cards and rows have fewer than 5 games and are excluded from winrate rankings
                </span>
              </div>
              {champions.data ? (
                champions.data.empty ? (
                  <EmptyState onReset={reset} />
                ) : (
                  <>
                    <ChampionFeatured champions={champions.data.champions.slice(0, 5)} />
                    {champions.data.champions.length > 5 && (
                      <details className="more">
                        <summary>All {champions.data.champions.length} champions</summary>
                        <ChampionPoolTable champions={champions.data.champions} />
                      </details>
                    )}
                  </>
                )
              ) : (
                <ChampionPoolSkeleton />
              )}
            </section>

            <section aria-labelledby="matchups" className="section">
              <h2 id="matchups" className="section__title">
                Lane matchups
              </h2>
              <div className="panels">
                <MatchupPanel
                  title="Vs. opponents"
                  subtitle={opposingLabel(data?.player.role)}
                  loading={vsPlayers.loading}
                  items={
                    vsPlayers.data?.matchups.map((m) => ({
                      ...m,
                      key: m.page,
                      to: `/players/${encodeURIComponent(m.page)}`,
                      detail: m.team,
                      icon: <PlayerPhoto page={m.page} name={m.name} size={26} />,
                    })) ?? null
                  }
                />
                <MatchupPanel
                  title="Vs. champions faced"
                  subtitle="Enemy laner’s champion"
                  loading={vsChampions.loading}
                  items={vsChampions.data?.matchups.map((m) => ({ ...m, key: m.champion, name: m.champion, icon: <ChampionIcon name={m.champion} size={26} /> })) ?? null}
                />
              </div>
            </section>

            <section aria-labelledby="bans" className="section">
              <div className="section__head">
                <h2 id="bans" className="section__title">
                  Target bans
                </h2>
                <span className="section__note">
                  Champions this player has played that opponents banned, by share of games
                </span>
              </div>
              {bans.data ? (
                bans.data.empty ? (
                  <p className="section__note">No bans against this player’s champions in this range.</p>
                ) : (
                  <TargetBans bans={bans.data.bans} />
                )
              ) : (
                <TargetBansSkeleton />
              )}
            </section>
          </>
        )}
      </main>
      <FilterBar
        params={params}
        onChange={(next) => setParams(next)}
        options={filters.data}
        range={data?.range ?? null}
      />
    </>
  )
}
