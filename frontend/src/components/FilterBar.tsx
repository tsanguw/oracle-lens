import type { FiltersResponse, Range } from '../api/types'

const KEYS = ['league', 'year', 'split', 'patch', 'side'] as const
type Key = (typeof KEYS)[number]

interface Props {
  params: URLSearchParams
  onChange: (next: URLSearchParams) => void
  options: FiltersResponse | null
  range: Range | null
}

/**
 * Filter state lives in the URL so every view is a shareable link. While the page shows the
 * default range (no params), the selects display what that range resolved to; changing one
 * pins those resolved values into the URL first so the change narrows the view instead of
 * silently widening it to all time.
 */
export default function FilterBar({ params, onChange, options, range }: Props) {
  const pinned = (): URLSearchParams => {
    const next = new URLSearchParams(params)
    if (range?.isDefault && range.resolved) {
      next.set('league', range.resolved.league)
      next.set('year', String(range.resolved.year))
      if (range.resolved.split) next.set('split', range.resolved.split)
    }
    return next
  }

  const shown = (key: Key): string => {
    const explicit = params.get(key)
    if (explicit) return explicit
    if (range?.isDefault && range.resolved && key in range.resolved) {
      const v = range.resolved[key as 'league' | 'year' | 'split']
      return v == null ? '' : String(v)
    }
    return ''
  }

  const set = (key: Key, value: string) => {
    const next = pinned()
    if (value) next.set(key, value)
    else next.delete(key)
    onChange(next)
  }

  const selects: { key: Key; label: string; blank: string; values: string[] }[] = [
    { key: 'league', label: 'League', blank: 'All leagues', values: options?.leagues ?? [] },
    { key: 'year', label: 'Year', blank: 'All years', values: (options?.years ?? []).map(String) },
    { key: 'split', label: 'Split', blank: 'All splits', values: options?.splits ?? [] },
    { key: 'patch', label: 'Patch', blank: 'All patches', values: options?.patches ?? [] },
    { key: 'side', label: 'Side', blank: 'Both sides', values: ['blue', 'red'] },
  ]

  return (
    <form className="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
      <div className="container filters__inner">
        {selects.map(({ key, label, blank, values }) => {
          const value = shown(key)
          // Keep a resolved value selectable even if the options list has not loaded yet.
          const all = value && !values.includes(value) ? [value, ...values] : values
          return (
            <label key={key} className="field">
              <span className="field__label">{label}</span>
              <select value={value} onChange={(e) => set(key, e.target.value)}>
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
        <button type="button" className="btn-reset" onClick={() => onChange(new URLSearchParams())}>
          Reset
        </button>
      </div>
    </form>
  )
}
