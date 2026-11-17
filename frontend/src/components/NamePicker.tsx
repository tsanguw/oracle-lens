import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface Props {
  names: string[]
  /** The chosen name, or an empty string for "all". */
  value: string
  onChange: (name: string) => void
  /** The small caps label on the button: "Team", "Champion". */
  label: string
  /** The first option, which chooses nothing: "All teams". */
  allLabel: string
  /** What the button says while nothing is chosen, when that should differ from the first option. */
  placeholder?: string
  /** The accessible name of the list. */
  listLabel: string
  /** The icon beside a name, in the button and in the list. */
  icon: (name: string, size: number) => ReactNode
  /** Names to grey out (they stay selectable), and what a screen reader hears after them. */
  dimmed?: (name: string) => boolean
  dimNote?: string
}

/**
 * A dropdown in the site's own style (the browser's native list cannot be themed reliably). It follows the select-only
 * combobox pattern: focus stays on the button, the highlighted option is named by `aria-activedescendant`, and the
 * arrow keys, Home, End, Enter, Space, Escape and typing a name's first letters all work as they do on a native select.
 */
export default function NamePicker({ names, value, onChange, label, allLabel, listLabel, icon, dimmed, dimNote, placeholder }: Props) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Index 0 is the "all" option (the empty value).
  const options = ['', ...names]
  const selected = Math.max(0, options.indexOf(value))
  const optionId = (i: number) => `${id}-option-${i}`

  const openList = () => {
    setActive(selected)
    setOpen(true)
  }
  const choose = (i: number) => {
    onChange(options[i])
    setOpen(false)
  }
  const move = (i: number) => setActive(Math.min(options.length - 1, Math.max(0, i)))

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(active + 1)
        return
      case 'ArrowUp':
        e.preventDefault()
        move(active - 1)
        return
      case 'Home':
        e.preventDefault()
        move(0)
        return
      case 'End':
        e.preventDefault()
        move(options.length - 1)
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        return
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        return
      case 'Tab':
        setOpen(false)
        return
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
    // Typing jumps to the next name that starts with what was typed in the last 700 ms; one letter repeated cycles.
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
    t.at = now
    const start = t.text.length === 1 ? active + 1 : active
    for (let n = 0; n < options.length; n++) {
      const i = (start + n) % options.length
      if ((options[i] || allLabel).toLowerCase().startsWith(t.text)) {
        setActive(i)
        break
      }
    }
  }

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        role="combobox"
        className="picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-labelledby={`${id}-key ${id}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <span id={`${id}-key`} className="picker__key">
          {label}
        </span>
        <span id={`${id}-value`} className="picker__value">
          {value && icon(value, 20)}
          <span className="picker__name">{value || placeholder || allLabel}</span>
        </span>
        <span className="picker__chevron" aria-hidden="true" />
      </button>
      {open && (
        // Pressing on the list (its scrollbar too) must not take focus off the button, or the blur would close it.
        <ul id={`${id}-list`} role="listbox" aria-label={listLabel} className="picker__list" onMouseDown={(e) => e.preventDefault()}>
          {options.map((name, i) => (
            <li
              key={name || allLabel}
              id={optionId(i)}
              role="option"
              aria-selected={i === selected}
              className={`picker__option${i === active ? ' is-active' : ''}${i === selected ? ' is-selected' : ''}${name && dimmed?.(name) ? ' is-dim' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {name ? icon(name, 22) : <span className="picker__blank" aria-hidden="true" />}
              <span className="picker__name">{name || allLabel}</span>
              {name && dimmed?.(name) && dimNote && <span className="sr-only">{dimNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
