import { useSearchParams } from 'react-router-dom'
import type {
  FiltersResponse,
  TeamContextResponse,
  TeamDraftResponse,
  TeamOpponentsResponse,
  TeamPlayersResponse,
  TeamResponse,
} from '../api/types'
import { useApi } from '../api/useApi'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import MatchupPanel from '../components/MatchupPanel'
import { StatTilesSkeleton } from '../components/StatTiles'
import TargetBans, { TargetBansSkeleton } from '../components/TargetBans'
import TeamContext from '../components/TeamContext'
import TeamHeader, { TeamHeaderSkeleton } from '../components/TeamHeader'
import { TeamPicksTable, TeamPlayersTable, TeamTiles } from '../components/TeamTables'

export default function TeamPage({ name }: { name: string }) {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const qs = query ? `?${query}` : ''
  const base = `/api/teams/${encodeURIComponent(name)}`

  const team = useApi<TeamResponse>(`${base}${qs}`)
  const players = useApi<TeamPlayersResponse>(`${base}/players${qs}`)
  const draft = useApi<TeamDraftResponse>(`${base}/draft${qs}`)
  const opponents = useApi<TeamOpponentsResponse>(`${base}/opponents${qs}`)
  const context = useApi<TeamContextResponse>(`${base}/context`)
  const filters = useApi<FiltersResponse>('/api/filters')

  const reset = () => setParams(new URLSearchParams())

  if (team.error?.status === 404) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Team not found</h1>
          <p className="empty__text">We don’t have a team called “{name}”. Check the spelling.</p>
        </div>
      </main>
    )
  }
  if (team.error) {
    return (
      <main className="main container">
        <div className="empty" role="alert">
          <h1 className="empty__title">Something went wrong</h1>
          <p className="empty__text">{team.error.message}. Try again in a moment.</p>
        </div>
      </main>
    )
  }

  const data = team.data
  const stale = team.loading || players.loading || draft.loading || opponents.loading

  return (
    <>
      {data ? <TeamHeader data={data} /> : <TeamHeaderSkeleton />}
      <TeamContext data={context.data} />
      <main className="main container" style={{ opacity: data && stale ? 0.6 : 1 }}>
        {data?.empty ? (
          <EmptyState onReset={reset} />
        ) : (
          <>
            <section aria-labelledby="overview" className="section">
              <h2 id="overview" className="section__title">
                Overview
              </h2>
              {data?.summary ? <TeamTiles summary={data.summary} /> : <StatTilesSkeleton />}
            </section>

            <section aria-labelledby="players" className="section">
              <div className="section__head">
                <h2 id="players" className="section__title">
                  Players
                </h2>
                <span className="section__note">Stats are for games with this team only</span>
              </div>
              {players.data ? (
                players.data.empty ? <EmptyState onReset={reset} /> : <TeamPlayersTable players={players.data.players} />
              ) : (
                <div className="skeleton" style={{ height: 240 }} aria-busy="true" />
              )}
            </section>

            <section aria-labelledby="picks" className="section">
              <div className="section__head">
                <h2 id="picks" className="section__title">
                  Most picked champions
                </h2>
                <span className="section__note">Grayed rows have fewer than 5 games</span>
              </div>
              {draft.data ? (
                draft.data.picks.length === 0 ? (
                  <p className="section__note">No draft data in this range.</p>
                ) : (
                  <TeamPicksTable picks={draft.data.picks} />
                )
              ) : (
                <div className="skeleton" style={{ height: 240 }} aria-busy="true" />
              )}
            </section>

            <section aria-labelledby="bans" className="section">
              <h2 id="bans" className="section__title">
                Bans
              </h2>
              <div className="panels">
                <div className="section">
                  <h3 className="ctx__sub">Banned by this team</h3>
                  {draft.data ? (
                    draft.data.bans.length === 0 ? <p className="section__note">No bans recorded.</p> : <TargetBans bans={draft.data.bans} />
                  ) : (
                    <TargetBansSkeleton />
                  )}
                </div>
                <div className="section">
                  <h3 className="ctx__sub">Banned against this team</h3>
                  {draft.data ? (
                    draft.data.bansAgainst.length === 0 ? (
                      <p className="section__note">No bans recorded.</p>
                    ) : (
                      <TargetBans bans={draft.data.bansAgainst} />
                    )
                  ) : (
                    <TargetBansSkeleton />
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby="h2h" className="section">
              <h2 id="h2h" className="section__title">
                Head to head
              </h2>
              <div className="panels">
                <MatchupPanel
                  title="Most played opponents"
                  subtitle="Game record and average gold difference"
                  loading={opponents.loading}
                  items={
                    opponents.data?.opponents.map((o) => ({
                      ...o,
                      key: o.team,
                      name: o.team,
                      to: `/teams/${encodeURIComponent(o.team)}`,
                    })) ?? null
                  }
                />
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
      />
    </>
  )
}
