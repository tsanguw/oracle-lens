import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LastUpdatedResponse } from '../api/types'
import { useApi } from '../api/useApi'
import { preloadRoute } from '../lib/routeChunks'
import HeaderSearch from './HeaderSearch'

const TABS = [
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
  { to: '/tournaments', label: 'Tournaments' },
]

/** Puts keyboard and screen-reader focus on the page content. */
function focusMain(): void {
  const main = document.querySelector('main')
  if (!main) return
  main.id = 'main'
  main.tabIndex = -1
  main.focus({ preventScroll: true })
}

/** After a link navigation (not a filter or page change within the same page), start the new page at the top. */
function RouteEffects() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo(0, 0)
    focusMain()
  }, [pathname])
  return null
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="skip-link"
      onClick={(e) => {
        e.preventDefault()
        focusMain()
        document.querySelector('main')?.scrollIntoView()
      }}
    >
      Skip to content
    </a>
  )
}

const TEXT_FIELD = /^(INPUT|TEXTAREA|SELECT)$/

/** True when the key was typed into something that takes text, where "/" has to stay a character. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || TEXT_FIELD.test(target.tagName))

function Header() {
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchPath, setSearchPath] = useState(pathname)
  const [searchKey, setSearchKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // Going to another page folds the search bar away (state adjusted while rendering, not in an effect).
  if (pathname !== searchPath) {
    setSearchPath(pathname)
    setSearchOpen(false)
  }

  // Every open starts with an empty box.
  const openSearch = () => {
    setSearchKey((k) => k + 1)
    setSearchOpen(true)
  }

  const toggleSearch = () => (searchOpen ? closeSearch(false) : openSearch())

  // Escape puts focus back on the icon; choosing a result, or any click elsewhere, leaves focus to the page.
  const closeSearch = (focusIcon: boolean) => {
    returnFocus.current = focusIcon
    setSearchOpen(false)
  }

  // "/" opens it from anywhere that is not a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      e.preventDefault()
      openSearch()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Opening puts the cursor in the box; closing it from the keyboard puts focus back on the icon.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
    else if (returnFocus.current) toggleRef.current?.focus()
    returnFocus.current = false
  }, [searchOpen])

  // A click anywhere outside the header folds it away.
  useEffect(() => {
    if (!searchOpen) return
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.site-header')) closeSearch(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [searchOpen])

  return (
    <header className="site-header">
      <div className={`site-header__inner${searchOpen ? ' is-searching' : ''}`}>
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Oracle Lens</span>
        </Link>
        <nav aria-label="Primary" className="tabs">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="tabs__link" onPointerEnter={() => preloadRoute(tab.to)} onFocus={() => preloadRoute(tab.to)}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <HeaderSearch
          id="header-search"
          open={searchOpen}
          resetKey={searchKey}
          inputRef={inputRef}
          toggleRef={toggleRef}
          onToggle={toggleSearch}
          onClose={() => closeSearch(true)}
          onNavigate={() => closeSearch(false)}
        />
      </div>
    </header>
  )
}

function Footer() {
  const { data } = useApi<LastUpdatedResponse>('/api/meta/last-updated')
  const updated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span>
          Data from <a href="https://lol.fandom.com">Leaguepedia</a>, licensed CC BY-SA.
        </span>
        <span>Data last updated: {updated ?? 'unknown'}</span>
      </div>
      <div className="site-footer__inner site-footer__legal">
        <span>
          Champion icons and Legends of Runeterra card art are from Riot Games’ Data Dragon. Team logos and player photos belong to their owners, and come from
          Leaguepedia. This is a non-commercial, educational project. Oracle Lens isn’t endorsed by Riot Games and doesn’t
          reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games
          properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
        </span>
      </div>
    </footer>
  )
}

export default function Layout() {
  return (
    <div className="page">
      <SkipLink />
      <RouteEffects />
      <Header />
      <Suspense fallback={<main className="main container"><div className="skeleton" style={{ height: 320 }} aria-busy="true" /></main>}>
        <Outlet />
      </Suspense>
      <Footer />
    </div>
  )
}
