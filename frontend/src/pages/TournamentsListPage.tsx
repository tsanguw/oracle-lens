import { Link, useSearchParams } from 'react-router-dom'
import type { FiltersResponse, TournamentListResponse } from '../api/types'
import { useApi } from '../api/useApi'
import FilterDock from '../components/FilterDock'
import { ListHead, listState, Pager, SearchField } from '../components/ListParts'
import { dateRange, shortTeam } from '../lib/format'
import { tournamentPath } from '../lib/tournamentPath'
import { TeamLogo } from '../components/Images'
import { LiveNow } from '../components/ListPodiums'
import { usePageMeta } from '../lib/usePageMeta'
import ErrorState from '../components/ErrorState'

const STAGES = ['Regular season', 'Playoffs', 'Qualifier']
const STATUSES = ['In progress', 'Completed']

export default function TournamentsListPage() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const list = useApi<TournamentListResponse>(`/api/tournaments${query ? `?${query}` : ''}`)
  const filters = useApi<FiltersResponse>('/api/filters')
  usePageMeta({ title: 'Pro League of Legends tournaments and brackets', description: 'Every pro League of Legends tournament since 2011: LCK, LPL, LEC, LCS, CBLOL, LCP, Worlds and MSI, with brackets, standings and results.' })
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
        {data && !data.empty && data.page === 1 && !q && !query && data.rows.some((r) => r.status === 'In progress') && (
          <LiveNow events={data.rows.filter((r) => r.status === 'In progress').slice(0, 3)} />
        )}
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
            <table className="lb lb--named" style={{ opacity: list.loading && data ? 0.6 : 1, minWidth: 760 }}>
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
                  <th scope="col" className="lb__left">Champion / leader</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="lb__left lb__player">
                      <Link to={tournamentPath(t)}>{t.name}</Link>
                      {t.status === 'In progress' && <span className="badge badge--live lb__live">In progress</span>}
                    </td>
                    <td className="lb__left">
                      <span className="tag tag--small">{t.league}</span>
                    </td>
                    <td className="lb__left lb__team">{t.stage ?? '—'}</td>
                    <td className="lb__left lb__team">{dateRange(t.startDate, t.endDate)}</td>
                    <td className="lb__left lb__team">
                      {t.standingTeam ? (
                        <span className="with-img">
                          <TeamLogo name={t.standingTeam} size={22} />
                          <span>
                            <span className="lb__sub">{t.standingLabel}</span>{' '}
                            <Link to={`/teams/${encodeURIComponent(t.standingTeam)}`} className="pool__link">
                              {shortTeam(t.standingTeam)}
                            </Link>
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!data &&
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={5}>
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
