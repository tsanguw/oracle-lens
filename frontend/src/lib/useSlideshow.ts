import { useEffect, useState } from 'react'

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Slideshow {
  count: number
  index: number
  /** The slide that just left; it keeps its zoomed pose while it fades out. */
  prev: number | null
  /** Slides that have been mounted: the current one, the next one, and any already shown. */
  seen: ReadonlySet<number>
  ready: ReadonlySet<number>
  markReady: (i: number) => void
  playing: boolean
  userPaused: boolean
  /** Changes whenever the timer restarts, so progress bars can restart with it. */
  tick: number
  /** How many times the slide has changed since the slideshow began (0 until the first swap). */
  swaps: number
  /** Move to a slide (wraps around). */
  go: (to: number) => void
  /** A deliberate choice: move and restart the timer. */
  pick: (to: number) => void
  /** Pointer or focus is on the controls: stop advancing. */
  hold: (on: boolean) => void
  togglePause: () => void
}

/**
 * Slideshow state shared by the home and player heroes. It advances on a timer, but not while the pointer or
 * keyboard focus is on the controls, the tab is hidden, the person has paused it, or motion is reduced (it
 * then starts paused). Only the current and next slides are loaded, since each is a large image.
 */
export function useSlideshow(urls: string[], interval: number): Slideshow {
  const count = urls.length
  const key = urls.join('|')

  const [index, setIndex] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [ready, setReady] = useState<ReadonlySet<number>>(() => new Set())
  const [userPaused, setUserPaused] = useState(prefersReducedMotion)
  const [held, setHeld] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [tick, setTick] = useState(0)
  const [swaps, setSwaps] = useState(0)

  // A different set of slides (new data, new filters) starts again from the first.
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    setIndex(0)
    setPrev(null)
    setSeen(new Set([0]))
    setReady(new Set())
    setSwaps(0)
  }

  const go = (to: number) => {
    if (count === 0) return
    const next = ((to % count) + count) % count
    if (next === index) return
    setPrev(index)
    setIndex(next)
    setSwaps((n) => n + 1)
  }

  useEffect(() => {
    if (count === 0) return
    const next = (index + 1) % count
    const img = new Image()
    img.src = urls[next]
    setSeen((s) => (s.has(index) && s.has(next) ? s : new Set(s).add(index).add(next)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, key])

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const playing = count > 1 && !userPaused && !held && !hidden
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => go(index + 1), interval)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, tick, key])

  return {
    count,
    index,
    prev,
    seen,
    ready,
    markReady: (i) => setReady((r) => (r.has(i) ? r : new Set(r).add(i))),
    playing,
    userPaused,
    tick,
    swaps,
    go,
    pick: (to) => {
      go(to)
      setTick((t) => t + 1)
    },
    hold: (on) => {
      setHeld(on)
      if (!on) setTick((t) => t + 1)
    },
    togglePause: () => {
      setUserPaused((p) => !p)
      setTick((t) => t + 1)
    },
  }
}
