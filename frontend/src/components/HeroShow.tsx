import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useMotionValue, useSpring, useTransform } from 'motion/react'
import type { ChampionListRow } from '../api/types'
import { percent } from '../lib/format'
import { cardFor } from '../lib/runeterra'
import Embers from './Embers'
import { ChampionIcon } from './Images'

/*
 * The home hero: Legends of Runeterra full art as a slow slideshow behind the search, one slide per
 * most-contested champion. Motion is quiet by design: a gentle crossfade and zoom, art that drifts a few
 * pixels against the pointer, faint region-coloured embers, and a caption that eases in. Everything stops
 * for people who ask for reduced motion, and the slideshow can always be paused.
 */

interface Slide {
  name: string
  url: string
  color: string
  region: string
  note: string
}

const GOLD = '#f0b429'
const INTERVAL = 7000
const MAX_SLIDES = 6
// Shown when the champion data is unavailable, so the hero never sits empty.
const FALLBACK = ['Ahri', 'Jinx', 'Lee Sin', 'Yasuo', 'Vi', 'Lux']

function buildSlides(rows: ChampionListRow[] | undefined): Slide[] {
  const slides: Slide[] = []
  for (const row of rows ?? []) {
    const card = cardFor(row.name)
    if (!card) continue
    slides.push({
      name: row.name,
      url: card.url,
      color: card.color,
      region: card.regionName,
      note: row.presence != null ? `Picked or banned in ${percent(row.presence)} of games` : 'Featured champion',
    })
    if (slides.length === MAX_SLIDES) break
  }
  for (const name of FALLBACK) {
    if (slides.length >= 5) break
    const card = cardFor(name)
    if (card && !slides.some((s) => s.name === name)) {
      slides.push({ name, url: card.url, color: card.color, region: card.regionName, note: 'Featured champion' })
    }
  }
  return slides
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Props {
  /** Champions in the order the hero should feature them; undefined while loading. */
  champions: ChampionListRow[] | undefined
  /** True once the champion request has finished, successfully or not. */
  settled: boolean
  children: ReactNode
}

export default function HeroShow({ champions, settled, children }: Props) {
  const slides = settled ? buildSlides(champions) : []
  const count = slides.length

  const [index, setIndex] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [ready, setReady] = useState<ReadonlySet<number>>(() => new Set())
  const [userPaused, setUserPaused] = useState(prefersReducedMotion)
  const [held, setHeld] = useState(false) // pointer or focus is on the controls
  const [hidden, setHidden] = useState(document.hidden)
  const [tick, setTick] = useState(0) // restarts the timer and the progress bar after a pause

  const go = (to: number) => {
    if (count === 0) return
    const next = ((to % count) + count) % count
    if (next === index) return
    setPrev(index)
    setIndex(next)
  }

  // Load the slide after this one in the background so a change never waits on the network.
  useEffect(() => {
    if (count === 0) return
    const next = (index + 1) % count
    const img = new Image()
    img.src = slides[next].url
    setSeen((s) => (s.has(index) && s.has(next) ? s : new Set(s).add(index).add(next)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count])

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const playing = count > 1 && !userPaused && !held && !hidden
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => go(index + 1), INTERVAL)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, tick, count])

  const hold = (on: boolean) => {
    setHeld(on)
    if (!on) setTick((t) => t + 1)
  }

  // Art drifts a few pixels against the pointer, springy and slow. Skipped on touch and for reduced motion.
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 45, damping: 18 })
  const sy = useSpring(my, { stiffness: 45, damping: 18 })
  const artX = useTransform(sx, (v) => v * -26)
  const artY = useTransform(sy, (v) => v * -14)
  const heroRef = useRef<HTMLElement>(null)
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion() || !heroRef.current) return
    const box = heroRef.current.getBoundingClientRect()
    mx.set((e.clientX - box.left) / box.width - 0.5)
    my.set((e.clientY - box.top) / box.height - 0.5)
  }
  const onPointerLeave = () => {
    mx.set(0)
    my.set(0)
  }

  const current = slides[index]
  const accent = current?.color ?? GOLD

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <section
          ref={heroRef}
          className={`stage${playing ? '' : ' is-still'}`}
          style={{ '--rc': accent } as CSSProperties}
          aria-roledescription="carousel"
          aria-label="Most contested champions"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <m.div className="stage__art" style={{ x: artX, y: artY }} aria-hidden="true">
            {slides.map((s, i) =>
              seen.has(i) ? (
                <img
                  key={s.name}
                  className={`stage__img${i === index ? ' is-on' : ''}${i === prev ? ' is-prev' : ''}${ready.has(i) ? ' is-ready' : ''}`}
                  src={s.url}
                  alt=""
                  decoding="async"
                  onLoad={() => setReady((r) => new Set(r).add(i))}
                />
              ) : null,
            )}
          </m.div>
          <div className="stage__scrim" aria-hidden="true" />
          {count > 0 && <Embers color={accent} />}

          <div className="stage__inner">
            {children}

            {current && (
              <div className="stage__panel" onPointerEnter={() => hold(true)} onPointerLeave={() => hold(false)} onFocus={() => hold(true)} onBlur={() => hold(false)}>
                <div
                  className="stage__caption"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${count}`}
                  aria-live={playing ? 'off' : 'polite'}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <m.div
                      key={current.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <span className="stage__chip">{current.region}</span>
                      <Link to={`/champions/${encodeURIComponent(current.name)}`} className="stage__champ">
                        {current.name}
                      </Link>
                      <span className="stage__note">{current.note}</span>
                    </m.div>
                  </AnimatePresence>
                </div>

                <div className="stage__controls">
                  <ul className="stage__thumbs">
                    {slides.map((s, i) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          className={`stage__thumb${i === index ? ' is-on' : ''}`}
                          aria-label={`Show ${s.name}`}
                          aria-current={i === index}
                          onClick={() => {
                            go(i)
                            setTick((t) => t + 1)
                          }}
                        >
                          <ChampionIcon name={s.name} size={44} />
                          <span className="stage__bar" aria-hidden="true">
                            <i key={`${index}-${tick}`} style={{ animationDuration: `${INTERVAL}ms` }} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="stage__pause"
                    aria-pressed={userPaused}
                    aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
                    onClick={() => {
                      setUserPaused((p) => !p)
                      setTick((t) => t + 1)
                    }}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      {userPaused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z" fill="currentColor" />}
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  )
}
