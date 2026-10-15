import type { FilterRange, FiltersResponse } from '../api/types'
import { dropInvalid, splitsFor, yearsFor } from '../lib/filterOptions'
import { usePatchOptions } from '../lib/usePatchOptions'
import FilterDock from './FilterDock'

const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']

type Key = 'league' | 'year' | 'split' | 'patch' | 'side' | 'role'

/** Choosing one of these replaces the default range; side and role only narrow the games within it. */
const RANGE_KEYS: Key[] = ['league', 'year', 'split', 'patch']

/** Everything that replaces the default range in the API, `tournament` included (it only arrives by URL). */
const RANGE_PARAMS = ['league', 'year', 'split', 'tournament', 'patch']

interface Props {
  params: URLSearchParams
  onChange: (next: URLSearchParams) => void
  options: FiltersResponse | null
  range: (FilterRange & { label: string; description?: string }) | null
  /** Offer a role filter (champion pages). Player and team pages have no role select. */
  withRole?: boolean
  /** The page's API understands `range=all`: clearing the last range filter then shows all history. */
  allTime?: boolean
}

/**
 * Filter state lives in the URL so every view is a shareable link. While the page shows the
 * default range (no params), the selects display what that range resolved to; changing a range
 * filter pins those resolved values into the URL first so the change narrows the view instead of
 * silently widening it to all time. Picking a league on a default range that spans several
 * leagues keeps that league's own latest split. Clearing the last range filter sets `range=all`
 * (all history); choosing any range filter drops it again.
 */
export default function FilterBar({ params, onChange, options, range, withRole = false, allTime = false }: Props) {
  const pinned = (key: Key, value: string): URLSearchParams => {
    const next = new URLSearchParams(params)
    if (range?.isDefault && RANGE_KEYS.includes(key)) {
      const own = key === 'league' ? range.leagues?.find((l) => l.league === value) : undefined
      const pin = own ?? range.resolved
      if (pin) {
        if (pin.league) next.set('league', pin.league)
        next.set('year', String(pin.year))
        if (pin.split) next.set('split', pin.split)
      } else if (range.leagues?.[0]) {
        next.set('year', String(range.leagues[0].year))
      }
    }
    return next
  }

  const shown = (key: Key): string => {
    const explicit = params.get(key)
    if (explicit) return explicit
    if (range?.isDefault && range.resolved && (key === 'league' || key === 'year' || key === 'split')) {
      const v = range.resolved[key]
      return v == null ? '' : String(v)
    }
    return ''
  }

  const set = (key: Key, value: string) => {
    const next = pinned(key, value)
    if (value) next.set(key, value)
    else next.delete(key)
    if (!RANGE_KEYS.includes(key)) {
      onChange(next)
      return
    }
    dropInvalid(next, options)
    if (allTime) {
      if (RANGE_PARAMS.some((k) => next.get(k))) next.delete('range')
      else next.set('range', 'all')
    }
    onChange(next)
  }

  const league = shown('league')
  const patches = usePatchOptions(options, league, shown('year'), shown('split'))
  const selects: { key: Key; label: string; blank: string; values: string[] }[] = [
    { key: 'league', label: 'League', blank: 'All leagues', values: options?.leagues ?? [] },
    { key: 'year', label: 'Year', blank: 'All years', values: (options ? yearsFor(options, league, shown('split')) : []).map(String) },
    { key: 'split', label: 'Split', blank: 'All splits', values: options ? splitsFor(options, league, shown('year')) : [] },
    ...(withRole ? [{ key: 'role' as const, label: 'Role', blank: 'All roles', values: ROLES }] : []),
    { key: 'patch', label: 'Patch', blank: 'All patches', values: patches },
    { key: 'side', label: 'Side', blank: 'Both sides', values: ['blue', 'red'] },
  ]

  return (
    <FilterDock showing={range?.label ?? null} note={allTime && range?.label === 'All time' ? range.description : undefined}>
      {selects.map(({ key, label, blank, values }) => {
        const value = shown(key)
        // Keep a resolved value selectable even if the options list has not loaded yet.
        const all = value && !values.includes(value) ? [value, ...values] : values
        return (
          <label key={key} className="field">
            <span className="field__label">{label}</span>
            <select name={key} value={value} onChange={(e) => set(key, e.target.value)}>
              <option value="">{blank}</option>
              {all.map((v) => (
                <option key={v} value={v}>
                  {key === 'side' ? v[0].toUpperCase() + v.slice(1) : v}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      <label className="check">
        <input
          type="checkbox"
          name="domestic"
          checked={params.get('domestic') === 'true'}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.checked) next.set('domestic', 'true')
            else next.delete('domestic')
            onChange(next)
          }}
        />
        Domestic only
      </label>
      <button type="button" className="btn-reset" aria-label="Reset filters" onClick={() => onChange(new URLSearchParams())}>
        Reset
      </button>
    </FilterDock>
  )
}
