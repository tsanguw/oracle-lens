import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import type { ChampionListRow } from '../api/types'
import { percent } from '../lib/format'
import { ACCENT_TEXT } from '../lib/theme'
import { CARD_RATIO, cardFor } from '../lib/runeterra'
import { StageBackdrop, StageMotion, STAGE_INTERVAL, useStage } from './ChampionStage'
import { SlideControls, type Slide } from './SlideParts'

/*
 * The home hero: Legends of Runeterra full art behind the search, one slide per most-contested champion, with the same
 * quiet motion as every other header (see ChampionStage): weather and mist in the card's region colours, depth against
 * the pointer, a slow zoom, a light sweep between champions, and a soft fade in over a glow. It all stops for reduced
 * motion, and the slideshow can always be paused.
 */

const MAX_SLIDES = 6
// Shown when the champion data is unavailable, so the hero never sits empty.
const FALLBACK = ['Ahri', 'Jinx', 'Lee Sin', 'Yasuo', 'Vi', 'Lux']

function slideFor(name: string, note: string): Slide | null {
  const card = cardFor(name)
  if (!card) return null
  return { name, url: card.url, color: card.color, region: card.regionName, note, focus: card.focus, ratio: CARD_RATIO, weather: card.region, mask: card.mask }
}

function buildSlides(rows: ChampionListRow[] | undefined): Slide[] {
  const slides: Slide[] = []
  for (const row of rows ?? []) {
    const slide = slideFor(row.name, row.presence != null ? `Picked or banned in ${percent(row.presence)} of games` : 'Featured champion')
    if (slide) slides.push(slide)
    if (slides.length === MAX_SLIDES) break
  }
  for (const name of FALLBACK) {
    if (slides.length >= 5) break
    const slide = !slides.some((s) => s.name === name) && slideFor(name, 'Featured champion')
    if (slide) slides.push(slide)
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
  const stage = useStage(settled ? buildSlides(champions) : [])
  const { slides, show, current } = stage

  return (
    <StageMotion>
      <section
        ref={stage.headerRef}
        className={`stage${show.playing ? '' : ' is-still'}`}
        style={{ '--rc': stage.accent ?? ACCENT_TEXT } as CSSProperties}
        aria-roledescription="carousel"
        aria-label="Most contested champions"
      >
        <div className="stage__clip">
          <StageBackdrop stage={stage} variant="home" />
        </div>
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
              <div className="stage__caption" role="group" aria-roledescription="slide" aria-label={`${show.index + 1} of ${show.count}`} aria-live={show.playing ? 'off' : 'polite'}>
                <AnimatePresence mode="wait" initial={false}>
                  <m.div key={current.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
                    <span className="stage__chip">{current.region}</span>
                    <Link to={`/champions/${encodeURIComponent(current.name)}`} className="stage__champ">
                      {current.name}
                    </Link>
                    <span className="stage__note">{current.note}</span>
                  </m.div>
                </AnimatePresence>
              </div>
              <SlideControls slides={slides} show={show} interval={STAGE_INTERVAL} />
            </div>
          )}
        </div>
      </section>
    </StageMotion>
  )
}
