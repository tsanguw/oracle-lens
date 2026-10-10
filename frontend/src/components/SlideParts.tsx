import type { Slideshow } from '../lib/useSlideshow'
import { ChampionIcon } from './Images'

export interface Slide {
  name: string
  url: string
  color: string
  region: string
  note: string
}

/** The art itself: only slides that have been mounted, the current one fading in. */
export function SlideLayers({ slides, show, className = 'stage__img' }: { slides: Slide[]; show: Slideshow; className?: string }) {
  return (
    <>
      {slides.map((s, i) =>
        show.seen.has(i) ? (
          <img
            key={s.name}
            className={`${className}${i === show.index ? ' is-on' : ''}${i === show.prev ? ' is-prev' : ''}${show.ready.has(i) ? ' is-ready' : ''}`}
            src={s.url}
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
export function SlideControls({ slides, show, interval, iconSize = 44 }: { slides: Slide[]; show: Slideshow; interval: number; iconSize?: number }) {
  return (
    <div className="stage__controls">
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
