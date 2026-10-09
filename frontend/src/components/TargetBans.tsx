import type { TargetBan } from '../api/types'
import { percent } from '../lib/format'

export default function TargetBans({ bans }: { bans: TargetBan[] }) {
  return (
    <div className="bans">
      {bans.map((b) => (
        <div key={b.champion} className="ban">
          <span className="icon-box icon-box--lg" aria-hidden="true" />
          <span className="ban__text">
            <span className="ban__name">{b.champion}</span>
            <span className="ban__rate">Banned in {percent(b.rate)} of games</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function TargetBansSkeleton() {
  return (
    <div className="bans" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 78 }} />
      ))}
    </div>
  )
}
