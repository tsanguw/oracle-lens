import { useEffect, useRef, useState, type ReactNode } from 'react'

/*
 * Pieces shared by every list page (players, teams, champions, tournaments): a title block, a name search,
 * sortable column headers and a pager. State lives in the URL, so every view is a shareable link.
 */

export function ListHead({ eyebrow, title, showing, note }: { eyebrow: string; title: string; showing: string | null; note?: ReactNode }) {
  return (
    <section className="lb-head">
      <div>
        <p className="lb-eyebrow">{eyebrow}</p>
        <h1 className="lb-title">{title}</h1>
        {note && <p className="lb-subnote">{note}</p>}
      </div>
      <div className="showing">
        <span className="showing__eyebrow">Showing</span>
        <span className="showing__label">{showing ?? ' '}</span>
      </div>
    </section>
  )
}

/** A debounced search box. `value` is the committed query (from the URL); `onSearch` fires after typing pauses. */
export function SearchField({ value, onSearch, label, placeholder }: { value: string; onSearch: (q: string) => void; label: string; placeholder: string }) {
  const [text, setText] = useState(value)
  const latest = useRef(onSearch)
  latest.current = onSearch

  // Follow external changes, such as Reset clearing the query.
  useEffect(() => setText(value), [value])

  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === value) return
    const timer = setTimeout(() => latest.current(trimmed), 250)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <label className="list-search">
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="list-search__icon">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input type="search" value={text} placeholder={placeholder} autoComplete="off" onChange={(e) => setText(e.target.value)} />
    </label>
  )
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  dir,
  onSort,
}: {
  label: string
  sortKey: K
  sort: string
  dir: 'asc' | 'desc'
  onSort: (key: K) => void
}) {
  const active = sort === sortKey
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={active ? 'is-sorted' : undefined}>
      <button type="button" className="lb__sort" onClick={() => onSort(sortKey)}>
        {label}
        {active && <span aria-hidden="true"> {dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

/** Page numbers to show: the first, the last, and a window around the current page. */
function pageWindow(current: number, last: number): (number | '…')[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last))
  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['…' as const, p] : [p]))
}

export function Pager({ page, pageSize, total, noun, onPage }: { page: number; pageSize: number; total: number; noun: string; onPage: (page: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize))
  const first = total > 0 ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(total, page * pageSize)
  return (
    <nav className="lb-pager" aria-label="Pagination">
      <span className="lb-pager__count">
        Showing {first}–{end} of {total.toLocaleString('en-US')} {noun}
      </span>
      {last > 1 && (
        <div className="lb-pager__pages">
          {pageWindow(page, last).map((p, i) =>
            p === '…' ? (
              <span key={`gap${i}`} className="lb-pager__gap">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`lb-pager__btn${p === page ? ' is-current' : ''}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
          {page < last && (
            <button type="button" className="lb-pager__btn" onClick={() => onPage(page + 1)}>
              Next →
            </button>
          )}
        </div>
      )}
    </nav>
  )
}

/** Reads and updates the list state in the URL. Changing a filter, sort or search returns to page 1. */
export function listState(params: URLSearchParams, setParams: (next: URLSearchParams) => void, defaultSort: string) {
  const sort = params.get('sort') ?? defaultSort
  const dir: 'asc' | 'desc' = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!keepPage) next.delete('page')
    setParams(next)
  }
  return {
    sort,
    dir,
    q: params.get('q') ?? '',
    update,
    /** First click sorts high to low (or A to Z reversed); clicking the active column flips it. */
    onSort: (key: string) => update({ sort: key === defaultSort ? '' : key, dir: key === sort && dir === 'desc' ? 'asc' : '' }),
    setPage: (p: number) => update({ page: p === 1 ? '' : String(p) }, true),
    /** For the filter bar: apply its URL and return to page 1. */
    applyFilters: (next: URLSearchParams) => {
      next.delete('page')
      setParams(next)
    },
  }
}
