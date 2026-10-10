import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LastUpdatedResponse } from '../api/types'
import { useApi } from '../api/useApi'

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

function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">[Site name]</span>
        </Link>
        <nav aria-label="Primary" className="tabs">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="tabs__link">
              {tab.label}
            </NavLink>
          ))}
        </nav>
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
          Leaguepedia. This is a non-commercial, educational project. [Site name] isn’t endorsed by Riot Games and doesn’t
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
      <Outlet />
      <Footer />
    </div>
  )
}
