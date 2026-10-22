import { useState, type CSSProperties } from 'react'
import { coverPosition, type Focus } from '../lib/runeterra'
import type { Slideshow } from '../lib/useSlideshow'
import { ChampionIcon } from './Images'

export interface Slide {
  name: string
  url: string
  /** Used instead of `url` if that one fails to load (our copy of the art is missing); none for art with no second source. */
  fallback?: string
  color: string
  /** The region's name for display; weather picks the atmosphere. */
  region: string
  note: string
  /** Where the champion sits in the image, and the image's width / height. */
  focus: Focus
  ratio: number
  /** The region key that picks the weather (Freljord, Ionia, ...). */
  weather: string
  /** A soft cut-out of the champion for the depth effect's near layer; null when there isn't one. */
  mask: string | null
}

/**
 * The art itself, as two layers that the depth parallax moves by different amounts: the whole image behind, and the
 * same image cut out to just the champion in front. Only slides that have been mounted are drawn, and `aspect` (the
 * frame's width / height) positions each so its champion stays in view.
 */
export function SlideLayers({ slides, show, aspect }: { slides: Slide[]; show: Slideshow; aspect: number }) {
  const [useFallback, setUseFallback] = useState<ReadonlySet<number>>(new Set())
  const srcOf = (i: number) => (useFallback.has(i) && slides[i].fallback ? slides[i].fallback : slides[i].url)
  const failed = (i: number) => {
    // our copy did not load: try the original once; if that fails too, stop waiting for it
    if (!useFallback.has(i) && slides[i].fallback) setUseFallback(new Set(useFallback).add(i))
    else show.markReady(i)
  }
  const state = (i: number) => `${i === show.index ? ' is-on' : ''}${i === show.prev ? ' is-prev' : ''}${show.ready.has(i) ? ' is-ready' : ''}`
  return (
    <>
      <div className="pstage__layer pstage__layer--far">
        {slides.map((s, i) =>
          show.seen.has(i) ? (
            <img
              key={s.name}
              className={`pstage__img${state(i)}`}
              src={srcOf(i)}
              style={{ objectPosition: coverPosition(s.focus, s.ratio, aspect) }}
              alt=""
              decoding="async"
              onLoad={() => show.markReady(i)}
              onError={() => failed(i)}
            />
          ) : null,
        )}
      </div>
      <div className="pstage__layer pstage__layer--near">
        {slides.map((s, i) => {
          if (!s.mask || !show.seen.has(i)) return null
          const pos = coverPosition(s.focus, s.ratio, aspect)
          const cut = {
            maskImage: `url(${s.mask})`,
            WebkitMaskImage: `url(${s.mask})`,
            maskSize: 'cover',
            WebkitMaskSize: 'cover',
            maskPosition: pos,
            WebkitMaskPosition: pos,
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }
          return <img key={s.name} className={`pstage__img${state(i)}`} src={srcOf(i)} style={{ objectPosition: pos, ...cut } as CSSProperties} alt="" decoding="async" />
        })}
      </div>
    </>
  )
}

/** Champion thumbnails with a progress bar on the current one, optional arrows, and a pause/play button. */
export function SlideControls({
  slides,
  show,
  interval,
  iconSize = 44,
  arrows = false,
  showPause = true,
}: {
  slides: Slide[]
  show: Slideshow
  interval: number
  iconSize?: number
  arrows?: boolean
  /** False when the page has one pause button for several slideshows (the Versus hero). */
  showPause?: boolean
}) {
  return (
    <div className="stage__controls">
      {arrows && (
        <button type="button" className="stage__arrow" aria-label="Previous champion" onClick={() => show.pick(show.index - 1)}>
          ‹
        </button>
      )}
      <ul className="stage__thumbs">
        {slides.map((s, i) => (
          <li key={s.name}>
            <button
              type="button"
              className={`stage__thumb${i === show.index ? ' is-on' : ''}`}
              aria-label={`Show ${s.name}`}
              aria-current={i === show.index}
              onClick={() => show.pick(i)}
            >
              <ChampionIcon name={s.name} size={iconSize} />
              <span className="stage__bar" aria-hidden="true">
                <i key={`${show.index}-${show.tick}`} style={{ animationDuration: `${interval}ms` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {arrows && (
        <button type="button" className="stage__arrow" aria-label="Next champion" onClick={() => show.pick(show.index + 1)}>
          ›
        </button>
      )}
      {showPause && (
        <button
          type="button"
          className="stage__pause"
          aria-pressed={show.userPaused}
          aria-label={show.userPaused ? 'Play slideshow' : 'Pause slideshow'}
          onClick={show.togglePause}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {show.userPaused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z" fill="currentColor" />}
          </svg>
        </button>
      )}
    </div>
  )
}
