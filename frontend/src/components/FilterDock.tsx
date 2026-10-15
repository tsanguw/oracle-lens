import { useId, useState, type ReactNode } from 'react'

/** Open by default on wide screens, collapsed on phones where the fields would cover the content. */
const startOpen = (): boolean => {
  try {
    return window.matchMedia('(min-width: 721px)').matches
  } catch {
    return true
  }
}

/**
 * The filter bar, docked to the bottom of the viewport so it stays reachable while scrolling the stats
 * it controls. It sits after the page content (a bottom-sticky element only holds when it comes last) and
 * can be collapsed to a slim bar that still says what range is showing, with an optional note beneath it.
 */
export default function FilterDock({ showing, note, children }: { showing: string | null; note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  const fieldsId = useId()
  return (
    <form className={`filters filters--dock${open ? ' is-open' : ''}`} aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
      <div className="container filters__head">
        <div className="filters__summary">
          <span className="filters__showing">
            <span className="filters__eyebrow">Showing</span> {showing ?? '…'}
          </span>
          {note && <span className="filters__note">{note}</span>}
        </div>
        <button type="button" className="filters__toggle" aria-expanded={open} aria-controls={fieldsId} onClick={() => setOpen(!open)}>
          Filters<span aria-hidden="true"> {open ? '▾' : '▴'}</span>
        </button>
      </div>
      <div id={fieldsId} className="container filters__inner" hidden={!open}>
        {children}
      </div>
    </form>
  )
}
