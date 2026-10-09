import { Link, useSearchParams } from 'react-router-dom'
import type { FiltersResponse, ListResponse, TeamListRow } from '../api/types'
import { useApi } from '../api/useApi'
import FilterBar from '../components/FilterBar'
import { ListHead, listState, Pager, SearchField, SortHeader } from '../components/ListParts'
import { decimal, duration, goldDiff, percent } from '../lib/format'

type SortKey = 'winRate' | 'games' | 'goldDiff' | 'killsPerGame' | 'towersPerGame' | 'avgGameLengthSec'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'games', label: 'Games' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'goldDiff', label: 'Gold diff' },
  { key: 'killsPerGame', label: 'Kills/game' },
  { key: 'towersPerGame', label: 'Towers/game' },
  { key: 'avgGameLengthSec', label: 'Avg game' },
]

export default function TeamsListPage() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const board = useApi<ListResponse<TeamListRow>>(`/api/teams${query ? `?${query}` : ''}`)
  const filters = useApi<FiltersResponse>('/api/filters')
  const { sort, dir, q, update, onSort, setPage, applyFilters } = listState(params, setParams, 'winRate')
  const data = board.data

  return (
    <>
      <main className="main container">
        <ListHead
          eyebrow="LCK · LPL · LEC · LCS · CBLOL · LCP + Internationals"
          title="Team leaderboard"
          showing={data?.range.label ?? null}
          note={`Minimum ${data?.minGames ?? 5} games to be ranked. Qualifiers and promotion series are not considered.`}
        />
        <SearchField value={q} onSearch={(v) => update({ q: v })} label="Search teams" placeholder="Search teams" />

        {board.error ? (
          <div className="empty" role="alert">
            <h2 className="empty__title">Something went wrong</h2>
            <p className="empty__text">{board.error.message}. Try again in a moment.</p>
          </div>
        ) : data && data.empty ? (
          <div className="empty">
            <h2 className="empty__title">No ranked teams</h2>
            <p className="empty__text">
              {q ? `No team matching “${q}” has` : 'No team has'} {data.minGames} or more games with these filters. Try widening the range.
            </p>
            <button type="button" className="btn-reset" onClick={() => setParams(new URLSearchParams())}>
              Reset filters
            </button>
          </div>
        ) : (
          <div className="table-wrap" aria-busy={board.loading}>
            <table className="lb" style={{ opacity: board.loading && data ? 0.6 : 1, minWidth: 940 }}>
              <thead>
                <tr>
                  <th scope="col" className="lb__rank">#</th>
                  <th scope="col" className="lb__left">Team</th>
                  <th scope="col" className="lb__left">League</th>
                  {COLUMNS.map((c) => (
                    <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} dir={dir} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.name}>
                    <td className={`lb__rank${r.rank <= 3 ? ' lb__rank--top' : ''}`}>{r.rank}</td>
                    <td className="lb__left lb__player">
                      <Link to={`/teams/${encodeURIComponent(r.name)}`}>{r.name}</Link>
                    </td>
                    <td className="lb__left">
                      <span className="tag tag--small">{r.league ?? 'INTL'}</span>
                    </td>
                    <td className={sort === 'games' ? 'is-sorted' : undefined}>{r.games}</td>
                    <td className={sort === 'winRate' ? 'is-sorted' : undefined}>
                      {percent(r.winRate)} <span className="lb__sub">{r.wins}-{r.losses}</span>
                    </td>
                    <td className={sort === 'goldDiff' ? 'is-sorted' : undefined}>{goldDiff(r.goldDiff).replace(' gold', '')}</td>
                    <td className={sort === 'killsPerGame' ? 'is-sorted' : undefined}>{decimal(r.killsPerGame)}</td>
                    <td className={sort === 'towersPerGame' ? 'is-sorted' : undefined}>{decimal(r.towersPerGame)}</td>
                    <td className={sort === 'avgGameLengthSec' ? 'is-sorted' : undefined}>{duration(r.avgGameLengthSec)}</td>
                  </tr>
                ))}
                {!data &&
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={9}>
                        <div className="skeleton" style={{ height: 22 }} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {data && !data.empty && <Pager page={data.page} pageSize={data.pageSize} total={data.total} noun="ranked teams" onPage={setPage} />}
      </main>
      <FilterBar params={params} onChange={applyFilters} options={filters.data} range={data?.range ?? null} />
    </>
  )
}
