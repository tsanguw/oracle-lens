import type { Ref } from 'react'
import SearchBox, { SearchIcon } from './SearchBox'

interface HeaderSearchProps {
  id: string
  open: boolean
  /** Changes on every open, so the box starts empty each time. */
  resetKey: number
  inputRef: Ref<HTMLInputElement>
  toggleRef: Ref<HTMLButtonElement>
  /** The icon was clicked: opens it when closed, closes it when open. */
  onToggle: () => void
  /** Escape: close it and hand focus back to the icon. */
  onClose: () => void
  /** A result was chosen: close it, and leave focus to the new page. */
  onNavigate: () => void
}

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * The end of the site header: the search field, which grows leftwards out of the icon and pushes the tabs left as it
 * does, and the icon itself, which becomes the close button while the field is open. Two siblings (not one box), so
 * the header's own flex layout does the pushing. Closed, the field has no width, is hidden and cannot be tabbed into.
 */
export default function HeaderSearch({ id, open, resetKey, inputRef, toggleRef, onToggle, onClose, onNavigate }: HeaderSearchProps) {
  return (
    <>
      <div id={id} className={`hfield${open ? ' is-open' : ''}`} inert={!open}>
        <SearchBox key={resetKey} variant="bar" inputRef={inputRef} onEscape={onClose} onNavigate={onNavigate} />
      </div>
      <button
        type="button"
        ref={toggleRef}
        className="hsearch__toggle"
        title={open ? 'Close search' : 'Search (press /)'}
        aria-keyshortcuts="/"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        {open ? CLOSE_ICON : <SearchIcon size={20} />}
        <span className="sr-only">{open ? 'Close search' : 'Search'}</span>
      </button>
    </>
  )
}
