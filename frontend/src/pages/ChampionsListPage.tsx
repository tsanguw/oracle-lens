import { Link, useSearchParams } from 'react-router-dom'
import type { ChampionListRow, FiltersResponse, ListResponse } from '../api/types'
import { useApi } from '../api/useApi'
import FilterBar from '../components/FilterBar'
import { ListHead, listState, Pager, SearchField, SortHeader } from '../components/ListParts'
import { decimal, NA, percent } from '../lib/format'
import { ChampionIcon } from '../components/Images'
import { usePageTitle } from '../lib/usePageTitle'
import ErrorState from '../components/ErrorState'

type SortKey = 'presence' | 'games' | 'winRate' | 'pickRate' | 'banRate' | 'kda'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'games', label: 'Games' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'pickRate', label: 'Pick rate' },
  { key: 'banRate', label: 'Ban rate' },
  { key: 'presence', label: 'Presence' },
  { key: 'kda', label: 'KDA' },
]

const CELL: Record<SortKey, (r: ChampionListRow) => string> = {
  games: (r) => String(r.games),
  winRate: (r) => percent(r.winRate),
  pickRate: (r) => percent(r.pickRate, 1),
  banRate: (r) => percent(r.banRate, 1),
  presence: (r) => percent(r.presence, 1),
  kda: (r) => decimal(r.kda),
}

export default function ChampionsListPage() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const board = useApi<ListResponse<ChampionListRow>>(`/api/champions${query ? `?${query}` : ''}`)
  const filters = useApi<FiltersResponse>('/api/filters')
  usePageTitle('Champions')
  const { sort, dir, q, update, onSort, setPage, applyFilters } = listState(params, setParams, 'presence')
  const data = board.data

  return (
    <>
      <main className="main container">
        <ListHead
          eyebrow="LCK · LPL · LEC · LCS · CBLOL · LCP + Internationals"
          title="Champions"
          showing={data?.range.label ?? null}
          note="Presence is the share of games where a champion was picked or banned. Grayed rows have fewer than 5 games. Qualifiers and promotion series are not considered."
        />
        <SearchField value={q} onSearch={(v) => update({ q: v })} label="Search champions" placeholder="Search champions" status={board.loading ? 'Loading results' : board.data ? `${board.data.total.toLocaleString('en-US')} champions` : undefined} />

        {board.error ? (
          <ErrorState message={board.error.message} onRetry={board.reload} level={2} />
        ) : data && data.empty ? (
          <div className="empty">
            <h2 className="empty__title">No champions found</h2>
            <p className="empty__text">{q ? `Nothing matches “${q}” with these filters.` : 'No games match these filters.'} Try widening the range.</p>
            <button type="button" className="btn-reset" onClick={() => setParams(new URLSearchParams())}>
              Reset filters
            </button>
          </div>
        ) : (
          <div className="table-wrap" aria-busy={board.loading}>
            <table className="lb" style={{ opacity: board.loading && data ? 0.6 : 1, minWidth: 900 }}>
              <thead>
                <tr>
                  <th scope="col" className="lb__rank">#</th>
                  <th scope="col" className="lb__left">Champion</th>
                  <th scope="col" className="lb__left">Role</th>
                  {COLUMNS.map((c) => (
                    <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} dir={dir} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.name} className={r.underMinSample ? 'is-dim' : undefined}>
                    <td className={`lb__rank${r.rank <= 3 ? ' lb__rank--top' : ''}`}>{r.rank}</td>
                    <td className="lb__left lb__player">
                      <span className="with-img">
                        <ChampionIcon name={r.name} size={30} />
                        <Link to={`/champions/${encodeURIComponent(r.name)}`}>{r.name}</Link>
                      </span>
                    </td>
                    <td className="lb__left lb__team">{r.role ?? NA}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={sort === c.key ? 'is-sorted' : undefined}>
                        {CELL[c.key](r)}
                      </td>
                    ))}
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

        {data && !data.empty && <Pager page={data.page} pageSize={data.pageSize} total={data.total} noun="champions" onPage={setPage} />}
      </main>
      <FilterBar params={params} onChange={applyFilters} options={filters.data} range={data?.range ?? null} withRole />
    </>
  )
}
