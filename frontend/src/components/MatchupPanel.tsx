import { Link } from 'react-router-dom'
import { goldDiff, percent } from '../lib/format'
import type { ReactNode } from 'react'

export interface MatchupItem {
  key: string
  /** Optional image shown before the name: a champion icon, player photo or team logo. */
  icon?: ReactNode
  name: string
  /** Optional link target, e.g. the opposing player's page. */
  to?: string
  /** Muted text after the name, e.g. the opponent's team. */
  detail?: string | null
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

interface Props {
  title: string
  subtitle: string
  items: MatchupItem[] | null
  loading: boolean
}

/** One side-by-side lane matchup panel; rows under the minimum sample are dimmed. */
export default function MatchupPanel({ title, subtitle, items, loading }: Props) {
  return (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title">{title}</h3>
        <span className="panel__note">{subtitle}</span>
      </div>
      {loading && !items ? (
        Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton matchup-skel" aria-busy="true" />)
      ) : !items || items.length === 0 ? (
        <p className="panel__empty">No lane matchups in this range.</p>
      ) : (
        items.map((m) => (
          <div key={m.key} className={`matchup${m.underMinSample ? ' is-dim' : ''}`}>
            <span className="matchup__who with-img">
              {m.icon}
              {m.to ? (
                <Link to={m.to} className="matchup__name">
                  {m.name}
                </Link>
              ) : (
                <span className="matchup__name">{m.name}</span>
              )}
              {m.detail && <span className="matchup__detail"> {m.detail}</span>}
            </span>
            <span className="matchup__num">{`${m.wins}-${m.losses}`}</span>
            <span className="matchup__num matchup__wr">{percent(m.winRate)}</span>
            <span className="matchup__num matchup__gd">{goldDiff(m.goldDiff)}</span>
          </div>
        ))
      )}
    </div>
  )
}
