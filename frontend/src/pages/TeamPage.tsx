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
import { SidePanel, splitLineup, TeamLineup, TeamPicksTable, TeamPlayersTable, TeamTiles } from '../components/TeamTables'
import { TeamLogo } from '../components/Images'
import { usePageTitle } from '../lib/usePageTitle'
import ErrorState from '../components/ErrorState'

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
  usePageTitle(name)

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
        <ErrorState message={team.error.message} onRetry={team.reload} level={1} />
      </main>
    )
  }

  const data = team.data
  const lineup = splitLineup(players.data?.players ?? [])
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
                  Lineup
                </h2>
                <span className="section__note">Stats are for games with this team only</span>
              </div>
              {players.data ? (
                players.data.empty ? (
                  <EmptyState onReset={reset} />
                ) : (
                  <>
                    <TeamLineup players={lineup.starters} />
                    {lineup.others.length > 0 && (
                      <>
                        <h3 className="ctx__sub">Substitutes and fill-ins</h3>
                        <TeamPlayersTable players={lineup.others} />
                      </>
                    )}
                  </>
                )
              ) : (
                <div className="skeleton" style={{ height: 280 }} aria-busy="true" />
              )}
            </section>

            <section aria-labelledby="draft" className="section">
              <h2 id="draft" className="section__title">
                Draft
              </h2>
              <div className="draft">
                <div className="section">
                  <h3 className="ctx__sub">Most picked champions</h3>
                  {draft.data ? (
                    draft.data.picks.length === 0 ? (
                      <p className="section__note">No draft data in this range.</p>
                    ) : (
                      <TeamPicksTable picks={draft.data.picks} />
                    )
                  ) : (
                    <div className="skeleton" style={{ height: 240 }} aria-busy="true" />
                  )}
                </div>
                <div className="section">
                  <h3 className="ctx__sub">Banned by this team</h3>
                  {draft.data ? (
                    draft.data.bans.length === 0 ? <p className="section__note">No bans recorded.</p> : <TargetBans bans={draft.data.bans} />
                  ) : (
                    <TargetBansSkeleton />
                  )}
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
                      icon: <TeamLogo name={o.team} size={26} />,
                    })) ?? null
                  }
                />
                {data?.summary && <SidePanel summary={data.summary} />}
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
