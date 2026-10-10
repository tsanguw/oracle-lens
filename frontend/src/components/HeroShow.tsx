import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useMotionValue, useSpring, useTransform } from 'motion/react'
import type { ChampionListRow } from '../api/types'
import { percent } from '../lib/format'
import { cardFor } from '../lib/runeterra'
import { prefersReducedMotion, useSlideshow } from '../lib/useSlideshow'
import Embers from './Embers'
import { SlideControls, SlideLayers, type Slide } from './SlideParts'

/*
 * The home hero: Legends of Runeterra full art as a slow slideshow behind the search, one slide per
 * most-contested champion. Motion is quiet by design: a gentle crossfade and zoom, art that drifts a few
 * pixels against the pointer, faint region-coloured embers, and a caption that eases in. Everything stops
 * for people who ask for reduced motion, and the slideshow can always be paused.
 */

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

interface Props {
  /** Champions in the order the hero should feature them; undefined while loading. */
  champions: ChampionListRow[] | undefined
  /** True once the champion request has finished, successfully or not. */
  settled: boolean
  children: ReactNode
}

export default function HeroShow({ champions, settled, children }: Props) {
  const slides = settled ? buildSlides(champions) : []
  const show = useSlideshow(
    slides.map((s) => s.url),
    INTERVAL,
  )

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

  const current = slides[show.index]
  const accent = current?.color ?? GOLD

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <section
          ref={heroRef}
          className={`stage${show.playing ? '' : ' is-still'}`}
          style={{ '--rc': accent } as CSSProperties}
          aria-roledescription="carousel"
          aria-label="Most contested champions"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <m.div className="stage__art" style={{ x: artX, y: artY }} aria-hidden="true">
            <SlideLayers slides={slides} show={show} />
          </m.div>
          <div className="stage__scrim" aria-hidden="true" />
          {show.count > 0 && <Embers color={accent} />}

          <div className="stage__inner">
            {children}

            {current && (
              <div
                className="stage__panel"
                onPointerEnter={() => show.hold(true)}
                onPointerLeave={() => show.hold(false)}
                onFocus={() => show.hold(true)}
                onBlur={() => show.hold(false)}
              >
                <div
                  className="stage__caption"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${show.index + 1} of ${show.count}`}
                  aria-live={show.playing ? 'off' : 'polite'}
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
                <SlideControls slides={slides} show={show} interval={INTERVAL} />
              </div>
            )}
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  )
}
