import { useSearchParams } from 'react-router-dom'
import type {
  ChampionContextResponse,
  ChampionCounter,
  ChampionPatchRow,
  ChampionPlayer,
  ChampionResponse,
  ChampionRoleRow,
  ChampionTeam,
  FiltersResponse,
} from '../api/types'
import { useApi } from '../api/useApi'
import {
  ChampionContext,
  ChampionHeader,
  ChampionHeaderSkeleton,
  ChampionPlayerCards,
  ChampionPatchesTable,
  ChampionPlayersTable,
  ChampionRolesTable,
  ChampionTeamsTable,
  ChampionTiles,
} from '../components/ChampionParts'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import MatchupPanel from '../components/MatchupPanel'
import { StatTilesSkeleton } from '../components/StatTiles'
import { ChampionIcon } from '../components/Images'
import { usePageMeta } from '../lib/usePageMeta'
import { championSeo, notFoundSeo } from '../lib/seoText'
import ErrorState from '../components/ErrorState'

const Skeleton = () => <div className="skeleton" style={{ height: 240 }} aria-busy="true" />

export default function ChampionPage({ name }: { name: string }) {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const base = `/api/champions/${encodeURIComponent(name)}`

  const champion = useApi<ChampionResponse>(`${base}${qs}`)
  const roles = useApi<{ empty: boolean; roles: ChampionRoleRow[] }>(`${base}/roles${qs}`)
  const players = useApi<{ empty: boolean; players: ChampionPlayer[] }>(`${base}/players${qs}`)
  const teams = useApi<{ empty: boolean; teams: ChampionTeam[] }>(`${base}/teams${qs}`)
  const counters = useApi<{ empty: boolean; matchups: ChampionCounter[] }>(`${base}/matchups${qs}`)
  const patches = useApi<{ empty: boolean; patches: ChampionPatchRow[] }>(`${base}/patches${qs}`)
  const context = useApi<ChampionContextResponse>(`${base}/context`)
  const filters = useApi<FiltersResponse>('/api/filters')
  const missing = champion.error?.status === 404
  usePageMeta({ ...(missing ? notFoundSeo('Champion') : championSeo(name, champion.data)), noindex: missing })

  const reset = () => setParams(new URLSearchParams())

  if (champion.error?.status === 404) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Champion not found</h1>
          <p className="empty__text">We don’t have a champion called “{name}”. Check the spelling.</p>
        </div>
      </main>
    )
  }
  if (champion.error) {
    return (
      <main className="main container">
        <ErrorState message={champion.error.message} onRetry={champion.reload} level={1} />
      </main>
    )
  }

  const data = champion.data
  const stale = champion.loading || players.loading || teams.loading || counters.loading || patches.loading

  return (
    <>
      {data ? <ChampionHeader data={data} /> : <ChampionHeaderSkeleton />}
      <ChampionContext data={context.data} />
      <main className="main container" style={{ opacity: data && stale ? 0.6 : 1 }}>
        {data?.empty ? (
          <EmptyState onReset={reset} />
        ) : (
          <>
            <section aria-labelledby="overview" className="section">
              <h2 id="overview" className="section__title">
                Overview
              </h2>
              {data?.summary ? <ChampionTiles summary={data.summary} /> : <StatTilesSkeleton />}
            </section>

            <section aria-labelledby="players" className="section">
              <div className="section__head">
                <h2 id="players" className="section__title">
                  Top players
                </h2>
                <span className="section__note">Most games on this champion. Grayed cards have fewer than 5 games</span>
              </div>
              {players.data ? (
                <>
                  <ChampionPlayerCards players={players.data.players.slice(0, 5)} />
                  {players.data.players.length > 5 && (
                    <>
                      <h3 className="ctx__sub">More players</h3>
                      <ChampionPlayersTable players={players.data.players.slice(5)} />
                    </>
                  )}
                </>
              ) : (
                <Skeleton />
              )}
            </section>

            <section aria-labelledby="teams" className="section">
              <h2 id="teams" className="section__title">
                Teams and roles
              </h2>
              <div className="duo">
                <div className="section">
                  <h3 className="ctx__sub">Top teams</h3>
                  {teams.data ? <ChampionTeamsTable teams={teams.data.teams} /> : <Skeleton />}
                </div>
                <div className="section">
                  <h3 className="ctx__sub">By role (ignores the role filter)</h3>
                  {roles.data ? <ChampionRolesTable roles={roles.data.roles} /> : <Skeleton />}
                </div>
              </div>
            </section>

            <section aria-labelledby="counters" className="section">
              <h2 id="counters" className="section__title">
                Matchups and patches
              </h2>
              <div className="duo duo--even">
                <div className="section">
                  <MatchupPanel
                    title="Vs. champions faced"
                    subtitle="Lane opponent’s champion"
                    loading={counters.loading}
                    items={
                      counters.data?.matchups.map((m) => ({ ...m, key: m.champion, name: m.champion, icon: <ChampionIcon name={m.champion} size={26} />, to: `/champions/${encodeURIComponent(m.champion)}` })) ??
                      null
                    }
                  />
                </div>
                <div className="section">
                  <h3 className="ctx__sub">By patch (newest first, pick rate is the share of games on that patch)</h3>
                  {patches.data ? <ChampionPatchesTable patches={patches.data.patches} /> : <Skeleton />}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <FilterBar
        params={params}
        onChange={(next) => setParams(next)}
        options={filters.data}
        range={data?.range ?? null}
        withRole
      />
    </>
  )
}
