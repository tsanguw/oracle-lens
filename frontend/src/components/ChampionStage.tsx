import { useCallback, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'
import type { TournamentChampion } from '../api/types'
import { percent } from '../lib/format'
import { CARD_RATIO, SPLASH_FOCUS, SPLASH_RATIO, cardFor, splashUrl } from '../lib/runeterra'
import { useAspect } from '../lib/useAspect'
import { prefersReducedMotion, useSlideshow } from '../lib/useSlideshow'
import { DEPTH, useDepthPointer, useEntrance, useScrollVar } from '../lib/useStageEffects'
import { useImages } from './Images'
import Mist from './Mist'
import { SlideControls, SlideLayers, type Slide } from './SlideParts'
import Weather from './Weather'

/*
 * The art behind a header (home, player, team, champion, tournament): Legends of Runeterra full art of the champions
 * that matter on that page, swappable with a row of icons. Around it, quietly: weather and mist in the card's region
 * colours, a depth effect that moves the champion against the background with the pointer, a slow zoom, a drift on
 * scroll, a light sweep when the champion changes, and an entrance that fades the art in over a glow and then lets the
 * text and numbers rise. All of it stops for visitors who ask for reduced motion.
 */

const GOLD = '#f0b429'
export const STAGE_INTERVAL = 7000

/** A champion to feature, and what to say about it. */
export interface SlideSource {
  champion: string
  note: string
}

/** Anything with a champion and a record: a player's champion row or a team's pick. */
export interface PickRow {
  champion: string
  games: number
  wins: number
  winRate: number
}

/**
 * Cards first, in the order given, using each champion's Legends of Runeterra art; then, until `min` slides, the
 * League splash art of the others. (Most newer champions have no card.)
 */
export function resolveSlides(sources: SlideSource[], keys: Record<string, string>, min: number, max: number): Slide[] {
  const slides: Slide[] = []
  for (const s of sources) {
    const card = cardFor(s.champion)
    if (!card) continue
    slides.push({
      name: s.champion,
      url: card.url,
      fallback: card.fallback,
      color: card.color,
      region: card.regionName,
      note: s.note,
      focus: card.focus,
      ratio: CARD_RATIO,
      weather: card.region,
      mask: card.mask,
    })
    if (slides.length === max) break
  }
  for (const s of sources) {
    if (slides.length >= min) break
    const key = keys[s.champion]
    if (key && !slides.some((x) => x.name === s.champion)) {
      slides.push({ name: s.champion, url: splashUrl(key), color: GOLD, region: 'League art', note: s.note, focus: SPLASH_FOCUS, ratio: SPLASH_RATIO, weather: 'Runeterra', mask: null })
    }
  }
  return slides
}

/** Everything a header needs: the slideshow, the accent colour, and the hooks that drive the effects. */
export function useStage(slides: Slide[]) {
  const show = useSlideshow(
    slides.map((s) => s.url),
    STAGE_INTERVAL,
  )
  const [artRef, artAspect, art] = useAspect(2)
  const [header, setHeader] = useState<HTMLElement | null>(null)
  const headerRef = useCallback((el: HTMLElement | null) => setHeader(el), [])
  useDepthPointer(header, art)
  useScrollVar(header)
  const staged = slides.length > 0
  const entered = useEntrance(show.ready.size > 0, staged)
  const current = slides[show.index]
  return {
    slides,
    show,
    current,
    staged,
    accent: current?.color ?? GOLD,
    artRef,
    artAspect,
    headerRef,
    /** The entrance is held back (text hidden, then rising) only when there is art and motion is allowed. */
    useEnter: staged && !prefersReducedMotion(),
    entered,
  }
}
export type Stage = ReturnType<typeof useStage>

/** A player's or a team's most-played champions, most played first. */
export function useChampionStage(rows: PickRow[] | undefined) {
  const { champions: keys } = useImages()
  const sources = [...(rows ?? [])]
    .sort((a, b) => b.games - a.games)
    .map((r) => ({ champion: r.champion, note: `${r.wins}W – ${r.games - r.wins}L in ${r.games} ${r.games === 1 ? 'game' : 'games'} · ${percent(r.winRate)} win rate` }))
  return useStage(resolveSlides(sources, keys, 3, 8))
}

/** A tournament's most contested champions (picked or banned in the most games). */
export function usePresenceStage(rows: TournamentChampion[] | undefined) {
  const { champions: keys } = useImages()
  const sources = [...(rows ?? [])]
    .sort((a, b) => b.presence - a.presence)
    .map((r) => ({ champion: r.champion, note: `Picked or banned in ${percent(r.presence)} of games · ${r.picks} picks, ${r.bans} bans` }))
  return useStage(resolveSlides(sources, keys, 3, 8))
}

/** One champion's own art, for the champion page. */
export function useSingleStage(champion: string) {
  const { champions: keys } = useImages()
  return useStage(resolveSlides([{ champion, note: '' }], keys, 1, 1))
}

/** Motion settings for everything inside: lazy-loaded features, and no movement for people who ask for none. */
export function StageMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

/** Class names for a header section. */
export const stageClass = (stage: Stage, extra = '') =>
  `hero${stage.staged ? ' hero--stage' : ''}${stage.useEnter ? ' use-enter' : ''}${stage.entered ? ' entered' : ''}${stage.slides.length > 1 && !stage.show.playing ? ' is-still' : ''}${extra}`

/** The art and everything drifting over it, filling the header behind its content. */
export function StageBackdrop({ stage, variant = 'page' }: { stage: Stage; variant?: 'page' | 'home' }) {
  if (!stage.staged) return null
  const { show, current } = stage
  return (
    <>
      <div className="pstage__base" aria-hidden="true" />
      <div ref={stage.artRef} className={`pstage__art${show.prev !== null ? ' has-prev' : ''}`} style={{ ['--depth' as string]: DEPTH }} aria-hidden="true">
        <SlideLayers slides={stage.slides} show={show} aspect={stage.artAspect} />
      </div>
      <div className={`pstage__scrim${variant === 'home' ? ' pstage__scrim--home' : ''}`} aria-hidden="true" />
      <Mist color={stage.accent} />
      <Weather region={current.weather} />
      {show.swaps > 0 && (
        <div key={show.swaps} className="pstage__sweep" aria-hidden="true">
          <i />
        </div>
      )}
    </>
  )
}

/** Which champion's art is showing, with arrows and icons to swap it. */
export function ChampionPicker({ stage, ariaLabel }: { stage: Stage; ariaLabel: string }) {
  const { slides, show, current } = stage
  if (!current) return null
  return (
    <div
      className="ppick rise"
      style={{ ['--i' as string]: 5 }}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onPointerEnter={() => show.hold(true)}
      onPointerLeave={() => show.hold(false)}
      onFocus={() => show.hold(true)}
      onBlur={() => show.hold(false)}
    >
      <div className="ppick__caption" role="group" aria-roledescription="slide" aria-label={`${show.index + 1} of ${show.count}`} aria-live={show.playing ? 'off' : 'polite'}>
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
      <SlideControls slides={slides} show={show} interval={STAGE_INTERVAL} iconSize={34} arrows />
    </div>
  )
}

/** For a header with a single piece of art: just says where it is from. */
export function ArtCredit({ stage }: { stage: Stage }) {
  const { current } = stage
  if (!current) return null
  return (
    <div className="ppick ppick--credit rise" style={{ ['--i' as string]: 5 }}>
      <span className="stage__chip">{current.region}</span>
      <span className="stage__note">{current.weather === 'Runeterra' && current.region === 'League art' ? 'League of Legends splash art' : 'Legends of Runeterra card art'}</span>
    </div>
  )
}
