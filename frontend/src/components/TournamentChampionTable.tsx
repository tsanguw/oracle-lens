import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TournamentChampion } from '../api/types'
import { MIN_PICKS, sortChampions, type ChampionSortKey } from '../lib/championSort'
import { NA, percent } from '../lib/format'
import { ChampionIcon } from './Images'

/** Rows shown before "Show all" is pressed. */
const PREVIEW_ROWS = 15

const COLUMNS: { key: ChampionSortKey; label: string; sortLabel: string }[] = [
  { key: 'presence', label: 'Presence', sortLabel: 'presence' },
  { key: 'picks', label: 'Picks', sortLabel: 'picks' },
  { key: 'wins', label: 'W-L', sortLabel: 'wins' },
  { key: 'winRate', label: 'Win rate', sortLabel: 'win rate' },
  { key: 'bans', label: 'Bans', sortLabel: 'bans' },
]

interface Props {
  champions: TournamentChampion[]
  /** The champion chosen in the dropdown, whose row is marked. */
  selected: string
}

/**
 * Every champion of the event, sortable by each column. It opens by presence (the share of games where the champion was
 * picked or banned) with the top rows showing; the heading states the count and the order so a cut-off list never
 * passes for the whole.
 */
export default function TournamentChampionTable({ champions, selected }: Props) {
  const [sort, setSort] = useState<{ key: ChampionSortKey; descending: boolean }>({ key: 'presence', descending: true })
  const [showAll, setShowAll] = useState(false)
  const rowsId = useId()
  const rows = sortChampions(champions, sort.key, sort.descending)
  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS)
  const column = COLUMNS.find((c) => c.key === sort.key)

  const choose = (key: ChampionSortKey) => setSort((s) => ({ key, descending: s.key === key ? !s.descending : true }))

  return (
    <div className="champtable">
      <h3 className="champtable__title" aria-live="polite">
        <span className="champtable__count">{champions.length} champions</span>
        <span className="champtable__sort">
          sorted by {column?.sortLabel}, {sort.descending ? 'highest' : 'lowest'} first
          {sort.key === 'winRate' ? `; ${MIN_PICKS}+ picks first` : ''}
        </span>
      </h3>
      <div className="table-wrap">
        <table className="pool">
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>
                Champion
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" className="pool__sort" onClick={() => choose(c.key)}>
                    {c.label}
                    <span className="pool__arrow" aria-hidden="true" />
                    <span className="sr-only">, sort by {c.sortLabel}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody id={rowsId}>
            {visible.map((c) => (
              <tr key={c.champion} className={c.champion === selected ? 'is-chosen' : undefined} aria-current={c.champion === selected ? 'true' : undefined}>
                <td className="pool__champ">
                  <span className="with-img">
                    <ChampionIcon name={c.champion} size={28} />
                    <Link to={`/champions/${encodeURIComponent(c.champion)}`} className="pool__link">
                      {c.champion}
                    </Link>
                  </span>
                </td>
                <td>{percent(c.presence)}</td>
                <td>{c.picks}</td>
                <td>{c.picks > 0 ? `${c.wins}-${c.picks - c.wins}` : NA}</td>
                <td className={c.picks > 0 && c.picks < MIN_PICKS ? 'pool__dim' : undefined}>
                  {percent(c.winRate)}
                  {c.picks > 0 && c.picks < MIN_PICKS && <span className="sr-only"> (under {MIN_PICKS} picks)</span>}
                </td>
                <td>{c.bans}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW_ROWS && (
        <button type="button" className="btn-reset btn-reset--inline matches__more" aria-expanded={showAll} aria-controls={rowsId} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show top ${PREVIEW_ROWS}` : `Show all ${rows.length} champions`}
        </button>
      )}
    </div>
  )
}
