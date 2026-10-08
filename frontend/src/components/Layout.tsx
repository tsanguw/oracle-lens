import { Link, NavLink, Outlet } from 'react-router-dom'
import type { LastUpdatedResponse } from '../api/types'
import { useApi } from '../api/useApi'

const TABS = [
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
  { to: '/tournaments', label: 'Tournaments' },
]

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
    </footer>
  )
}

export default function Layout() {
  return (
    <div className="page">
      <Header />
      <Outlet />
      <Footer />
    </div>
  )
}
