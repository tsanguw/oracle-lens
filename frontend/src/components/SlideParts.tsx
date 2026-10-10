import { coverPosition, type Focus } from '../lib/runeterra'
import type { Slideshow } from '../lib/useSlideshow'
import { ChampionIcon } from './Images'

export interface Slide {
  name: string
  url: string
  color: string
  region: string
  note: string
  /** Where the champion sits in the image, and the image's width / height. */
  focus: Focus
  ratio: number
}

/**
 * The art itself: only slides that have been mounted, the current one fading in. `aspect` is the frame's
 * width / height; each image is positioned so its champion stays in view.
 */
export function SlideLayers({ slides, show, aspect, className = 'stage__img' }: { slides: Slide[]; show: Slideshow; aspect: number; className?: string }) {
  return (
    <>
      {slides.map((s, i) =>
        show.seen.has(i) ? (
          <img
            key={s.name}
            className={`${className}${i === show.index ? ' is-on' : ''}${i === show.prev ? ' is-prev' : ''}${show.ready.has(i) ? ' is-ready' : ''}`}
            src={s.url}
            style={{ objectPosition: coverPosition(s.focus, s.ratio, aspect) }}
            alt=""
            decoding="async"
            onLoad={() => show.markReady(i)}
          />
        ) : null,
      )}
    </>
  )
}

/** Champion thumbnails with a progress bar on the current one, and a pause/play button. */
export function SlideControls({
  slides,
  show,
  interval,
  iconSize = 44,
  arrows = false,
}: {
  slides: Slide[]
  show: Slideshow
  interval: number
  iconSize?: number
  arrows?: boolean
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
    </div>
  )
}
