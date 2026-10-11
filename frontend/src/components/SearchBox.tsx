import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SearchResponse } from '../api/types'
import { apiUrl } from '../api/base'
import { tournamentPath } from '../lib/tournamentPath'

interface Item {
  group: 'Players' | 'Teams' | 'Champions' | 'Tournaments'
  key: string
  label: string
  meta: string
  to: string
}

const toItems = (r: SearchResponse): Item[] => [
  ...r.players.map((p) => ({
    group: 'Players' as const,
    key: `p:${p.page}`,
    label: p.name,
    meta: [p.role, p.team].filter(Boolean).join(' · '),
    to: `/players/${encodeURIComponent(p.page)}`,
  })),
  ...r.teams.map((t) => ({
    group: 'Teams' as const,
    key: `t:${t.name}`,
    label: t.name,
    meta: t.league ?? '',
    to: `/teams/${encodeURIComponent(t.name)}`,
  })),
  ...r.champions.map((c) => ({
    group: 'Champions' as const,
    key: `c:${c.name}`,
    label: c.name,
    meta: c.role ?? '',
    to: `/champions/${encodeURIComponent(c.name)}`,
  })),
  ...r.tournaments.map((t) => ({
    group: 'Tournaments' as const,
    key: `o:${t.id}`,
    label: t.name,
    meta: t.status,
    to: tournamentPath(t),
  })),
]

const GROUPS: Item['group'][] = ['Players', 'Teams', 'Champions', 'Tournaments']

export default function SearchBox() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const listId = useId()
  const q = query.trim()

  // Debounced search; a newer keystroke aborts the older request so results never arrive out of order.
  useEffect(() => {
    if (q.length < 2) {
      setItems(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(apiUrl(`/api/search?q=${encodeURIComponent(q)}`), { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : Promise.reject(new Error('search failed'))))
        .then((data) => {
          setItems(toItems(data))
          setActive(-1)
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([])
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const go = (item: Item) => {
    setOpen(false)
    navigate(item.to)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
    if (!items?.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(items[active >= 0 ? active : 0])
    }
  }

  const showPanel = open && q.length >= 2 && items !== null

  return (
    <div className="search" ref={boxRef}>
      <label className="search__label" htmlFor="global-search">
        Search players, teams, champions, tournaments
      </label>
      <div className={`search__box${showPanel ? ' is-open' : ''}`}>
        <svg className="search__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id="global-search"
          className="search__input"
          type="search"
          name="q"
          spellCheck={false}
          autoComplete="off"
          placeholder="Try “Faker”, “T1” or “Azir”"
          value={query}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="search__hint">Enter</kbd>
      </div>
      {showPanel && (
        <div className="search__panel" id={listId} role="listbox" aria-label="Search results">
          {items.length === 0 ? (
            <p className="search__none">No matches for “{q}”.</p>
          ) : (
            GROUPS.map((group) => {
              const rows = items.map((item, index) => ({ item, index })).filter((r) => r.item.group === group)
              if (rows.length === 0) return null
              return (
                <div key={group} className="search__group">
                  <h3 className="search__group-title">{group}</h3>
                  {rows.map(({ item, index }) => (
                    <Link
                      key={item.key}
                      id={`${listId}-${index}`}
                      to={item.to}
                      role="option"
                      aria-selected={index === active}
                      className={`search__row${index === active ? ' is-active' : ''}`}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActive(index)}
                    >
                      <span className="search__row-name">{item.label}</span>
                      <span className="search__row-meta">{item.meta}</span>
                    </Link>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
