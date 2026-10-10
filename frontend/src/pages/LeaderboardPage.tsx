import { Link, useSearchParams } from 'react-router-dom'
import type { FiltersResponse, LeaderboardResponse } from '../api/types'
import { useApi } from '../api/useApi'
import FilterDock from '../components/FilterDock'
import { SearchField } from '../components/ListParts'
import { dropInvalid, splitsFor, yearsFor } from '../lib/filterOptions'
import { decimal, percent, shortTeam, whole } from '../lib/format'
import Podium from '../components/Podium'
import { PlayerPhoto, TeamLogo } from '../components/Images'
import { usePageTitle } from '../lib/usePageTitle'
import { usePatchOptions } from '../lib/usePatchOptions'
import ErrorState from '../components/ErrorState'

const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']

type SortKey = 'games' | 'winRate' | 'kda' | 'killParticipation' | 'damagePerMin' | 'csPerMin' | 'visionPerMin'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'games', label: 'Games' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'kda', label: 'KDA' },
  { key: 'killParticipation', label: 'KP' },
  { key: 'damagePerMin', label: 'DPM' },
  { key: 'csPerMin', label: 'CS/min' },
  { key: 'visionPerMin', label: 'Vision/min' },
]

const CELL: Record<SortKey, (r: LeaderboardResponse['players'][number]) => string> = {
  games: (r) => String(r.games),
  winRate: (r) => percent(r.winRate),
  kda: (r) => decimal(r.kda),
  killParticipation: (r) => percent(r.killParticipation),
  damagePerMin: (r) => whole(r.damagePerMin),
  csPerMin: (r) => decimal(r.csPerMin),
  visionPerMin: (r) => decimal(r.visionPerMin, 2),
}

/** Page numbers to show: the first, the last, and a window around the current page. */
function pageWindow(current: number, last: number): (number | '…')[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last))
  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['…' as const, p] : [p]))
}

export default function LeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const board = useApi<LeaderboardResponse>(`/api/leaderboard/players${query ? `?${query}` : ''}`)
  const filters = useApi<FiltersResponse>('/api/filters')
  usePageTitle('Player leaderboard')

  const data = board.data
  const range = data?.range ?? null
  const sort = (params.get('sort') as SortKey | null) ?? 'kda'
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc'

  /**
   * Choosing a league/year/split/patch replaces the default range, so while the default is showing
   * the resolved year and split are pinned into the URL first. The change then narrows the view
   * instead of silently widening it to all time.
   */
  const update = (changes: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params)
    const rangeKeys = ['league', 'year', 'split', 'patch']
    if (range?.isDefault && rangeKeys.some((k) => k in changes)) {
      const own = range.leagues.find((l) => l.league === changes.league)
      const pin = own ?? range.resolved
      if (pin) {
        next.set('year', String(pin.year))
        if (pin.split) next.set('split', pin.split)
      } else if (range.leagues[0]) {
        next.set('year', String(range.leagues[0].year))
      }
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (resetPage) next.delete('page')
    setParams(rangeKeys.some((k) => k in changes) ? dropInvalid(next, filters.data) : next)
  }

  const shown = (key: 'league' | 'year' | 'split'): string => {
    const explicit = params.get(key)
    if (explicit) return explicit
    if (range?.isDefault && range.resolved && key !== 'league') {
      const v = range.resolved[key]
      return v == null ? '' : String(v)
    }
    return ''
  }

  const patches = usePatchOptions(filters.data, shown('league'), shown('year'), shown('split'))
  const selects: { key: 'league' | 'year' | 'split' | 'role' | 'patch'; label: string; blank: string; values: string[] }[] = [
    { key: 'league', label: 'League', blank: 'All leagues', values: filters.data?.leagues ?? [] },
    { key: 'year', label: 'Year', blank: 'All years', values: (filters.data ? yearsFor(filters.data, shown('league'), shown('split')) : []).map(String) },
    { key: 'split', label: 'Split', blank: 'All splits', values: filters.data ? splitsFor(filters.data, shown('league'), shown('year')) : [] },
    { key: 'role', label: 'Role', blank: 'All roles', values: ROLES },
    { key: 'patch', label: 'Patch', blank: 'All patches', values: patches },
  ]

  const onSort = (key: SortKey) =>
    update({ sort: key === 'kda' ? '' : key, dir: key === sort && dir === 'desc' ? 'asc' : '' }, true)

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <>
    <main className="main container">
      <section className="lb-head">
        <div>
          <p className="lb-eyebrow">LCK · LPL · LEC · LCS · CBLOL · LCP + Internationals</p>
          <h1 className="lb-title">Player leaderboard</h1>
        </div>
        <div className="showing">
          <span className="showing__eyebrow">Showing</span>
          <span className="showing__label">{range?.label ?? ' '}</span>
        </div>
      </section>
      {data && !data.empty && data.page === 1 && !params.get('q') && data.players.length >= 3 && (
        <Podium rows={data.players.slice(0, 3)} sort={sort} />
      )}
      <SearchField value={params.get('q') ?? ''} onSearch={(v) => update({ q: v })} label="Search players" placeholder="Search players" status={board.loading ? 'Loading results' : board.data ? `${board.data.total.toLocaleString('en-US')} players` : undefined} />

      {board.error ? (
        <ErrorState message={board.error.message} onRetry={board.reload} level={2} />
      ) : data && data.empty ? (
        <div className="empty">
          <h2 className="empty__title">No ranked players</h2>
          <p className="empty__text">
            No player has {data.minGames} or more games with these filters. Try widening the range.
          </p>
          <button type="button" className="btn-reset" onClick={() => setParams(new URLSearchParams())}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="table-wrap" aria-busy={board.loading}>
          <table className="lb lb--ranked" style={{ opacity: board.loading && data ? 0.6 : 1 }}>
            <thead>
              <tr>
                <th scope="col" className="lb__rank">#</th>
                <th scope="col" className="lb__left">Player</th>
                <th scope="col" className="lb__left">Team</th>
                <th scope="col" className="lb__left">League</th>
                <th scope="col" className="lb__left">Role</th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={sort === c.key ? 'is-sorted' : undefined}
                  >
                    <button type="button" className="lb__sort" onClick={() => onSort(c.key)}>
                      {c.label}
                      {sort === c.key && <span aria-hidden="true"> {dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? []).map((r) => (
                <tr key={r.page}>
                  <td className={`lb__rank${r.rank <= 3 ? ' lb__rank--top' : ''}`}>{r.rank}</td>
                  <td className="lb__left lb__player">
                    <span className="with-img">
                      <PlayerPhoto page={r.page} name={r.name} role={r.role} size={32} />
                      <Link to={`/players/${encodeURIComponent(r.page)}`}>{r.name}</Link>
                    </span>
                  </td>
                  <td className="lb__left lb__team">
                    {r.team ? (
                      <span className="with-img">
                        <TeamLogo name={r.team} size={22} />
                        {shortTeam(r.team)}
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="lb__left">
                    <span className="tag tag--small">{r.league ?? 'INTL'}</span>
                  </td>
                  <td className="lb__left lb__team">{r.role ?? 'N/A'}</td>
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
                    <td colSpan={5 + COLUMNS.length}>
                      <div className="skeleton" style={{ height: 22 }} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !data.empty && (
        <nav className="lb-pager" aria-label="Pagination">
          <span className="lb-pager__count">
            Showing {first}–{last} of {data.total.toLocaleString('en-US')} ranked players
          </span>
          <div className="lb-pager__pages">
            {pageWindow(data.page, lastPage).map((p, i) =>
              p === '…' ? (
                <span key={`gap${i}`} className="lb-pager__gap">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`lb-pager__btn${p === data.page ? ' is-current' : ''}`}
                  aria-current={p === data.page ? 'page' : undefined}
                  onClick={() => update({ page: p === 1 ? '' : String(p) }, false)}
                >
                  {p}
                </button>
              ),
            )}
            {data.page < lastPage && (
              <button type="button" className="lb-pager__btn" onClick={() => update({ page: String(data.page + 1) }, false)}>
                Next →
              </button>
            )}
          </div>
        </nav>
      )}
    </main>
      <FilterDock showing={range?.label ?? null}>
        {selects.map(({ key, label, blank, values }) => {
          const value = key === 'league' || key === 'year' || key === 'split' ? shown(key) : (params.get(key) ?? '')
          const all = value && !values.includes(value) ? [value, ...values] : values
          return (
            <label key={key} className="field">
              <span className="field__label">{label}</span>
              <select name={key} value={value} onChange={(e) => update({ [key]: e.target.value })}>
                <option value="">{blank}</option>
                {all.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
        <label className="check">
          <input
            type="checkbox"
            name="domestic"
            checked={params.get('domestic') === 'true'}
            onChange={(e) => update({ domestic: e.target.checked ? 'true' : '' })}
          />
          Domestic only
        </label>
        <button type="button" className="btn-reset" aria-label="Reset filters" onClick={() => setParams(new URLSearchParams())}>
          Reset
        </button>
        <p className="lb-note">
          Minimum {data?.minGames ?? 5} games to be ranked. Qualifiers and promotion series are not
          considered.
        </p>
      </FilterDock>
    </>
  )
}
