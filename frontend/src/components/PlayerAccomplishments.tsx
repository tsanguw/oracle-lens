import { Fragment, memo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ContextEvent, InternationalAccomplishment, PlayerAccomplishmentsResponse, RegionAccomplishments } from '../api/types'
import { placeLabel } from '../lib/format'
import { tournamentPath } from '../lib/tournamentPath'

interface Tile {
  label: string
  value: string
  sub: string
  /** The latest related event, linked on its own line. */
  event: ContextEvent | null
  /** Replaces the event line (the international tiles list their best finish instead). */
  extra?: ReactNode
  /** A title or championship: marked with the accent edge. */
  win?: boolean
}

interface Group {
  title: string
  /** The league, as a tag next to the region. */
  tag?: string
  note: string
  tiles: Tile[]
}

const title = (count: number, event: ContextEvent | null, win = false): Omit<Tile, 'label'> => ({
  value: String(count),
  sub: event ? '' : 'None yet',
  event,
  win: win && count > 0,
})

const placementName = (place: string) => (place === '1' ? 'Champion' : place === '2' ? 'Runner-up' : placeLabel(place))

/** "Best placement: 6x Champion (13, 15, 16)": the finish, how often, and the year of each event, linked. */
function BestPlacement({ best }: { best: NonNullable<InternationalAccomplishment['best']> }) {
  const times = best.events.length
  return (
    <span className="tile__sub">
      Best placement: {times > 1 ? `${times}× ` : ''}
      {placementName(best.place)}{' '}
      <span className="acc__years">
        (
        {best.events.map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 && ', '}
            <Link to={tournamentPath(e)} className="tile__event" aria-label={e.name} title={e.name}>
              {e.startDate?.slice(2, 4) ?? e.name}
            </Link>
          </Fragment>
        ))}
        )
      </span>
    </span>
  )
}

function international(a: PlayerAccomplishmentsResponse): Group {
  return {
    title: 'International',
    note: 'Appearances and best placement',
    tiles: a.international.map((i) => ({
      label: i.label,
      value: String(i.appearances),
      sub: i.appearances === 0 ? 'None yet' : '',
      event: null,
      extra: i.best && <BestPlacement best={i.best} />,
      win: i.best?.place === '1',
    })),
  }
}

/** One group per region, so a player who moved between regions never has their results blended. */
function regional(r: RegionAccomplishments): Group {
  return {
    title: r.region,
    tag: r.league,
    note: 'Playoff finishes',
    tiles: [
      {
        label: 'Splits played',
        value: String(r.splitsPlayed),
        sub: '',
        event: r.lastSplit?.event ?? null,
      },
      { label: 'Playoffs 1st', ...title(r.playoffsFirst.count, r.playoffsFirst.mostRecent, true) },
      { label: 'Playoffs 2nd', ...title(r.playoffsSecond.count, r.playoffsSecond.mostRecent) },
    ],
  }
}

/** True when there is nothing to show: no international games and no domestic split played. */
export const noAccomplishments = (a: PlayerAccomplishmentsResponse) =>
  a.international.every((i) => i.appearances === 0) && a.regions.length === 0

/** Memoised: the page re-renders on every filter change and every sibling fetch, while this data never changes. */
const PlayerAccomplishments = memo(function PlayerAccomplishments({ data }: { data: PlayerAccomplishmentsResponse }) {
  return (
    <div className="acc">
      {[international(data), ...data.regions.map(regional)].map((g) => (
        <div key={g.title} className="acc__group">
          <div className="acc__head">
            <h3 className="acc__title">{g.title}</h3>
            {g.tag && <span className="tag tag--small">{g.tag}</span>}
            <span className="acc__note">{g.note}</span>
          </div>
          <div className="tiles tiles--three">
            {g.tiles.map((tile) => (
              <div key={tile.label} className={`tile${tile.win ? ' tile--win' : ''}${tile.value === '0' ? ' tile--empty' : ''}`}>
                <span className="tile__label">{tile.label}</span>
                <span className="tile__value">{tile.value}</span>
                {tile.sub && <span className="tile__sub">{tile.sub}</span>}
                {tile.extra}
                {tile.event && (
                  <span className="tile__sub">
                    Most recent:{' '}
                    <Link to={tournamentPath(tile.event)} className="tile__event">
                      {tile.event.name}
                    </Link>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
})

export default PlayerAccomplishments

/** Built from the real layout classes (International plus one region, the usual case) so it reserves the height the content will take at every breakpoint. */
export function PlayerAccomplishmentsSkeleton() {
  return (
    <div className="acc" aria-busy="true">
      {[0, 1].map((group) => (
        <div key={group} className="acc__group">
          <div className="acc__head">
            <div className="skeleton" style={{ width: 120, height: 24 }} />
            <div className="skeleton" style={{ width: 150, height: 14 }} />
          </div>
          <div className="tiles tiles--three">
            {[0, 1, 2].map((tile) => (
              <div key={tile} className="tile">
                <div className="skeleton" style={{ width: 90, height: 14 }} />
                <div className="skeleton" style={{ width: 70, height: 36 }} />
                <div className="skeleton" style={{ width: 110, height: 18 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
