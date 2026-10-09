import { Link, useSearchParams } from 'react-router-dom'
import type { FiltersResponse, TournamentListResponse } from '../api/types'
import { useApi } from '../api/useApi'
import FilterDock from '../components/FilterDock'
import { ListHead, listState, Pager, SearchField } from '../components/ListParts'
import { dateRange } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import ErrorState from '../components/ErrorState'

const STAGES = ['Regular season', 'Playoffs', 'Qualifier']
const STATUSES = ['In progress', 'Completed']

export default function TournamentsListPage() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const list = useApi<TournamentListResponse>(`/api/tournaments${query ? `?${query}` : ''}`)
  const filters = useApi<FiltersResponse>('/api/filters')
  usePageTitle('Tournaments')
  const { sort, dir, q, update, setPage, applyFilters } = listState(params, setParams, 'date')
  const data = list.data

  const selects = [
    { key: 'league', label: 'League', blank: 'All leagues', values: [...(filters.data?.leagues ?? []), 'INTL'] },
    { key: 'year', label: 'Year', blank: 'All years', values: (filters.data?.years ?? []).map(String) },
    { key: 'stage', label: 'Stage', blank: 'All but qualifiers', values: STAGES },
    { key: 'status', label: 'Status', blank: 'Any status', values: STATUSES },
  ]
  const showing =
    [params.get('league'), params.get('year'), params.get('stage'), params.get('status')].filter(Boolean).join(' · ') ||
    'All events, newest first'

  const toggleSort = (key: 'date' | 'name') =>
    update({ sort: key === 'date' ? '' : key, dir: key === sort && dir === 'desc' ? 'asc' : '' })
  const arrow = (key: string) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '')

  return (
    <>
      <main className="main container">
        <ListHead
          eyebrow="LCK · LPL · LEC · LCS · CBLOL · LCP + Internationals"
          title="Tournaments"
          showing={showing}
          note="Qualifiers and promotion series are hidden unless you choose the Qualifier stage."
        />
        <SearchField value={q} onSearch={(v) => update({ q: v })} label="Search tournaments" placeholder="Search tournaments" status={list.loading ? 'Loading results' : list.data ? `${list.data.total.toLocaleString('en-US')} tournaments` : undefined} />

        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} level={2} />
        ) : data && data.empty ? (
          <div className="empty">
            <h2 className="empty__title">No tournaments found</h2>
            <p className="empty__text">{q ? `Nothing matches “${q}” with these filters.` : 'No events match these filters.'} Try widening them.</p>
            <button type="button" className="btn-reset" onClick={() => setParams(new URLSearchParams())}>
              Reset filters
            </button>
          </div>
        ) : (
          <div className="table-wrap" aria-busy={list.loading}>
            <table className="lb" style={{ opacity: list.loading && data ? 0.6 : 1, minWidth: 860 }}>
              <thead>
                <tr>
                  <th scope="col" className={`lb__left${sort === 'name' ? ' is-sorted' : ''}`} aria-sort={sort === 'name' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="lb__sort lb__sort--left" onClick={() => toggleSort('name')}>
                      Tournament{arrow('name')}
                    </button>
                  </th>
                  <th scope="col" className="lb__left">League</th>
                  <th scope="col" className="lb__left">Stage</th>
                  <th scope="col" className={`lb__left${sort === 'date' ? ' is-sorted' : ''}`} aria-sort={sort === 'date' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="lb__sort lb__sort--left" onClick={() => toggleSort('date')}>
                      Dates{arrow('date')}
                    </button>
                  </th>
                  <th scope="col" className="lb__left">Status</th>
                  <th scope="col" className="lb__left">Champion / leader</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="lb__left lb__player">
                      <Link to={`/tournaments/${t.id}`}>{t.name}</Link>
                    </td>
                    <td className="lb__left">
                      <span className="tag tag--small">{t.league}</span>
                    </td>
                    <td className="lb__left lb__team">{t.stage ?? '—'}</td>
                    <td className="lb__left lb__team">{dateRange(t.startDate, t.endDate)}</td>
                    <td className="lb__left">
                      <span className={`badge${t.status === 'In progress' ? ' badge--live' : ''}`}>{t.status}</span>
                    </td>
                    <td className="lb__left lb__team">
                      {t.standingTeam ? (
                        <>
                          <span className="lb__sub">{t.standingLabel}</span>{' '}
                          <Link to={`/teams/${encodeURIComponent(t.standingTeam)}`} className="pool__link">
                            {t.standingTeam}
                          </Link>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!data &&
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <div className="skeleton" style={{ height: 22 }} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {data && !data.empty && <Pager page={data.page} pageSize={data.pageSize} total={data.total} noun="tournaments" onPage={setPage} />}
      </main>
      <FilterDock showing={showing}>
        {selects.map(({ key, label, blank, values }) => (
          <label key={key} className="field">
            <span className="field__label">{label}</span>
            <select
              name={key}
              value={params.get(key) ?? ''}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set(key, e.target.value)
                else next.delete(key)
                applyFilters(next)
              }}
            >
              <option value="">{blank}</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" className="btn-reset" onClick={() => setParams(new URLSearchParams())}>
          Reset
        </button>
      </FilterDock>
    </>
  )
}
