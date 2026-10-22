import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SearchResponse } from '../api/types'
import { apiUrl } from '../api/base'
import { tournamentPath } from '../lib/tournamentPath'

interface Item {
  group: 'Players' | 'Teams' | 'Champions' | 'Tournaments'
  key: string
  /** What a picker hands back: the player's page name or the team's name. */
  value: string
  label: string
  meta: string
  to: string
}

const toItems = (r: SearchResponse): Item[] => [
  ...r.players.map((p) => ({
    group: 'Players' as const,
    key: `p:${p.page}`,
    value: p.page,
    label: p.name,
    meta: [p.role, p.team].filter(Boolean).join(' · '),
    to: `/players/${encodeURIComponent(p.page)}`,
  })),
  ...r.teams.map((t) => ({
    group: 'Teams' as const,
    key: `t:${t.name}`,
    value: t.name,
    label: t.name,
    meta: t.league ?? '',
    to: `/teams/${encodeURIComponent(t.name)}`,
  })),
  ...r.champions.map((c) => ({
    group: 'Champions' as const,
    key: `c:${c.name}`,
    value: c.name,
    label: c.name,
    meta: c.role ?? '',
    to: `/champions/${encodeURIComponent(c.name)}`,
  })),
  ...r.tournaments.map((t) => ({
    group: 'Tournaments' as const,
    key: `o:${t.id}`,
    value: String(t.id),
    label: t.name,
    meta: t.status,
    to: tournamentPath(t),
  })),
]

const GROUPS: Item['group'][] = ['Players', 'Teams', 'Champions', 'Tournaments']
const SEARCH_FAILED = 'Search isn’t responding. Check your connection and try again.'

export function SearchIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="search__icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface SearchBoxProps {
  /** "hero" is the big box on the home page; "bar" is the one in the bar that slides open in the site header. */
  variant?: 'hero' | 'bar'
  inputRef?: Ref<HTMLInputElement>
  /** Escape was pressed (the results close first; the header bar then closes itself). */
  onEscape?: () => void
  /** A result was chosen, so the header bar does not stay open over a page it did not change. */
  onNavigate?: () => void
  /**
   * Picker mode: only this kind of result is listed, and choosing one calls `onSelect` with its page name (a player) or
   * name (a team) instead of navigating. The compare page uses it to pick a subject.
   */
  pick?: { kind: 'Players' | 'Teams'; label?: string; onSelect: (value: string) => void; exclude?: string; placeholder?: string }
}

export default function SearchBox({ variant = 'hero', inputRef, onEscape, onNavigate, pick }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const listId = useId()
  const inputId = useId()
  const bar = variant === 'bar'
  const q = query.trim()

  // Debounced search; a newer keystroke aborts the older request so results never arrive out of order.
  useEffect(() => {
    if (q.length < 2) {
      setItems(null)
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(apiUrl(`/api/search?q=${encodeURIComponent(q)}`), { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : Promise.reject(new Error('search failed'))))
        .then((data) => {
          setItems(pick ? toItems(data).filter((i) => i.group === pick.kind && i.value !== pick.exclude) : toItems(data))
          setFailed(false)
          setActive(-1)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setItems([])
          setFailed(true)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  // Listens for a click elsewhere only while the results are open (the home page has two of these boxes).
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // The results panel is up from the second letter on: "Searching…" until the answer arrives.
  const showPanel = open && q.length >= 2
  // Screen readers hear the outcome once it is known, not every keystroke.
  const announcement =
    !showPanel || items === null
      ? ''
      : failed
        ? SEARCH_FAILED
        : items.length === 0
          ? `No matches for ${q}.`
          : `${items.length} ${items.length === 1 ? 'result' : 'results'}.`

  /** After choosing a result: close the results and clear the box, so it is empty on the next page (or when the same page is chosen). */
  const reset = () => {
    setOpen(false)
    setQuery('')
    setItems(null)
  }

  const go = (item: Item) => {
    reset()
    if (pick) {
      pick.onSelect(item.value)
      return
    }
    navigate(item.to)
    onNavigate?.()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      onEscape?.()
    }
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

  return (
    <div className={`search${bar ? ' search--bar' : ''}`} ref={boxRef}>
      <label className={bar ? 'sr-only' : 'search__label'} htmlFor={inputId}>
        {pick ? (pick.label ?? `Search ${pick.kind.toLowerCase()}`) : 'Search players, teams, champions, tournaments'}
      </label>
      <div className={`search__box${showPanel ? ' is-open' : ''}`}>
        <SearchIcon />
        <input
          id={inputId}
          ref={inputRef}
          className="search__input"
          type="search"
          name="q"
          spellCheck={false}
          autoComplete="off"
          placeholder={pick?.placeholder ?? (bar ? 'Search players, teams…' : 'Try “Faker”, “T1” or “Azir”')}
          value={query}
          role="combobox"
          enterKeyHint="search"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
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
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {showPanel && (
        <div className="search__panel" id={listId} role="listbox" aria-label="Search results">
          {items === null ? (
            <p className="search__none">Searching…</p>
          ) : failed ? (
            <p className="search__none">{SEARCH_FAILED}</p>
          ) : items.length === 0 ? (
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
                      onClick={(e) => {
                        if (pick) {
                          e.preventDefault()
                          go(item)
                          return
                        }
                        reset()
                        onNavigate?.()
                      }}
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
