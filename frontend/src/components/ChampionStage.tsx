import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'
import { percent } from '../lib/format'
import { CARD_RATIO, SPLASH_FOCUS, SPLASH_RATIO, cardFor } from '../lib/runeterra'
import { useAspect } from '../lib/useAspect'
import { useSlideshow } from '../lib/useSlideshow'
import Embers from './Embers'
import { useImages } from './Images'
import { SlideControls, SlideLayers, type Slide } from './SlideParts'

/*
 * The art behind a player or team header: their most-played champions as full-bleed Legends of Runeterra art that you
 * can swap with a row of champion icons, with a few embers drifting over it. Used by PlayerHeader and TeamHeader.
 */

const GOLD = '#f0b429'
const INTERVAL = 7000
const MAX_SLIDES = 8
const MIN_SLIDES = 3
const SPLASH = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading'

/** Anything with a champion and a record: a player's champion row or a team's pick. */
export interface PickRow {
  champion: string
  games: number
  wins: number
  winRate: number
}

/**
 * Most-played first, using each champion's Legends of Runeterra card where one exists. When fewer than three of them
 * have a card, the gap is filled with the League loading-screen art of the next most played.
 */
function buildSlides(rows: PickRow[] | undefined, keys: Record<string, string>): Slide[] {
  const sorted = [...(rows ?? [])].sort((a, b) => b.games - a.games)
  const note = (r: PickRow) =>
    `${r.wins}W – ${r.games - r.wins}L in ${r.games} ${r.games === 1 ? 'game' : 'games'} · ${percent(r.winRate)} win rate`
  const slides: Slide[] = []
  for (const r of sorted) {
    const card = cardFor(r.champion)
    if (!card) continue
    slides.push({ name: r.champion, url: card.url, color: card.color, region: card.regionName, focus: card.focus, ratio: CARD_RATIO, note: note(r) })
    if (slides.length === MAX_SLIDES) break
  }
  for (const r of sorted) {
    if (slides.length >= MIN_SLIDES) break
    const key = keys[r.champion]
    if (key && !slides.some((s) => s.name === r.champion)) {
      slides.push({ name: r.champion, url: `${SPLASH}/${key}_0.jpg`, color: GOLD, region: 'Champion pool', focus: SPLASH_FOCUS, ratio: SPLASH_RATIO, note: note(r) })
    }
  }
  return slides
}

export function useChampionStage(rows: PickRow[] | undefined) {
  const { champions: keys } = useImages()
  const slides = buildSlides(rows, keys)
  const show = useSlideshow(
    slides.map((s) => s.url),
    INTERVAL,
  )
  const [artRef, artAspect] = useAspect(2)
  const current = slides[show.index]
  return {
    slides,
    show,
    current,
    staged: slides.length > 0,
    accent: current?.color ?? GOLD,
    artRef,
    artAspect,
  }
}
export type ChampionStage = ReturnType<typeof useChampionStage>

/** Motion settings for everything inside: lazy-loaded features, and no movement for people who ask for none. */
export function StageMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

/** Class names for the header section. */
export const stageClass = (stage: ChampionStage) => `hero${stage.staged ? ' hero--stage' : ''}${stage.show.playing ? '' : ' is-still'}`

/** The art, a scrim for the text over it, and embers, filling the header behind its content. */
export function StageBackdrop({ stage }: { stage: ChampionStage }) {
  if (!stage.staged) return null
  return (
    <>
      <div ref={stage.artRef} className="pstage__art" aria-hidden="true">
        <SlideLayers slides={stage.slides} show={stage.show} aspect={stage.artAspect} />
      </div>
      <div className="pstage__scrim" aria-hidden="true" />
      <Embers color={stage.accent} />
    </>
  )
}

/** Which champion's art is showing, with arrows and icons to swap it. */
export function ChampionPicker({ stage, ariaLabel }: { stage: ChampionStage; ariaLabel: string }) {
  const { slides, show, current } = stage
  if (!current) return null
  return (
    <div
      className="ppick"
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onPointerEnter={() => show.hold(true)}
      onPointerLeave={() => show.hold(false)}
      onFocus={() => show.hold(true)}
      onBlur={() => show.hold(false)}
    >
      <div
        className="ppick__caption"
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
      <SlideControls slides={slides} show={show} interval={INTERVAL} iconSize={34} arrows />
    </div>
  )
}
