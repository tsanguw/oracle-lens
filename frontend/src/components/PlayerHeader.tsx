import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'
import type { ChampionRow, PlayerResponse } from '../api/types'
import { decimal, percent, rate } from '../lib/format'
import { cardFor } from '../lib/runeterra'
import { useSlideshow } from '../lib/useSlideshow'
import Embers from './Embers'
import { PlayerPhoto, TeamLogo, useImages } from './Images'
import { SlideControls, SlideLayers, type Slide } from './SlideParts'

const GOLD = '#f0b429'
const INTERVAL = 7000
const MAX_SLIDES = 6
const MIN_SLIDES = 3
const SPLASH = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading'

/**
 * The player's most-played champions as tall art: their Legends of Runeterra card where one exists. When fewer
 * than three of them have a card, the gap is filled with the League loading-screen art of the next most played.
 */
function buildSlides(champions: ChampionRow[] | undefined, keys: Record<string, string>): Slide[] {
  const rows = [...(champions ?? [])].sort((a, b) => b.games - a.games)
  const note = (r: ChampionRow) =>
    `${r.wins}W – ${r.losses}L in ${r.games} ${r.games === 1 ? 'game' : 'games'} · ${percent(r.winRate)} win rate`
  const slides: Slide[] = []
  for (const r of rows) {
    const card = cardFor(r.champion)
    if (!card) continue
    slides.push({ name: r.champion, url: card.url, color: card.color, region: card.regionName, note: note(r) })
    if (slides.length === MAX_SLIDES) break
  }
  for (const r of rows) {
    if (slides.length >= MIN_SLIDES) break
    const key = keys[r.champion]
    if (key && !slides.some((s) => s.name === r.champion)) {
      slides.push({ name: r.champion, url: `${SPLASH}/${key}_0.jpg`, color: GOLD, region: 'Champion pool', note: note(r) })
    }
  }
  return slides
}

export default function PlayerHeader({ data, champions }: { data: PlayerResponse; champions?: ChampionRow[] }) {
  const { player, range, summary } = data
  const { champions: keys } = useImages()
  const slides = buildSlides(champions, keys)
  const show = useSlideshow(
    slides.map((s) => s.url),
    INTERVAL,
  )
  const current = slides[show.index]
  const staged = slides.length > 0
  const accent = current?.color ?? GOLD

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <section className={`hero${staged ? ' hero--stage' : ''}${show.playing ? '' : ' is-still'}`} style={{ '--rc': accent } as CSSProperties}>
          {staged && (
            <>
              <div className="pstage__bg" aria-hidden="true">
                <SlideLayers slides={slides} show={show} className="pstage__img" />
              </div>
              <div className="pstage__scrim" aria-hidden="true" />
              <Embers color={accent} />
            </>
          )}
          <div className="container hero__inner">
            <div className="hero__main">
              <div className="hero__who">
                <div className="hero-img">
                  <PlayerPhoto page={player.name} name={player.displayName} role={player.role} size={128} />
                </div>
                <div className="hero__text">
                  <div className="tags">
                    {player.role && <span className="tag tag--gold">{player.role}</span>}
                    {player.league && <span className="tag">{player.league}</span>}
                  </div>
                  <h1 className="hero__name">{player.displayName}</h1>
                  {player.team && (
                    <Link to={`/teams/${encodeURIComponent(player.team)}`} className="hero__team with-img">
                      <TeamLogo name={player.team} size={22} />
                      {player.team}
                    </Link>
                  )}
                  {summary && (
                    <>
                      <dl className="form">
                        <div className="form__stat">
                          <dd className="form__value">{percent(summary.winRate)}</dd>
                          <dt className="form__label">Win rate</dt>
                        </div>
                        <div className="form__stat">
                          <dd className="form__value">{decimal(summary.kda)}</dd>
                          <dt className="form__label">KDA</dt>
                        </div>
                        <div className="form__stat">
                          <dd className="form__value">{summary.games}</dd>
                          <dt className="form__label">Games</dt>
                        </div>
                      </dl>
                      <p className="form__note">
                        Blue side {percent(rate(summary.blueWins, summary.blueGames))}, red side {percent(rate(summary.redWins, summary.redGames))}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="showing">
                <span className="showing__eyebrow">Showing</span>
                <span className="showing__label">{range.label}</span>
                <span className="showing__desc">{range.description}</span>
              </div>
            </div>

            {current && (
              <aside
                className="pcard"
                role="group"
                aria-roledescription="carousel"
                aria-label="Most-played champions"
                onPointerEnter={() => show.hold(true)}
                onPointerLeave={() => show.hold(false)}
                onFocus={() => show.hold(true)}
                onBlur={() => show.hold(false)}
              >
                <span className="pcard__label">Champion pool</span>
                <div className="pcard__frame">
                  <SlideLayers slides={slides} show={show} className="pcard__img" />
                  <div
                    className="pcard__caption"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${show.index + 1} of ${show.count}`}
                    aria-live={show.playing ? 'off' : 'polite'}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <m.div
                        key={current.name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <span className="stage__chip">{current.region}</span>
                        <Link to={`/champions/${encodeURIComponent(current.name)}`} className="stage__champ">
                          {current.name}
                        </Link>
                        <span className="stage__note">{current.note}</span>
                      </m.div>
                    </AnimatePresence>
                  </div>
                </div>
                <SlideControls slides={slides} show={show} interval={INTERVAL} iconSize={26} />
              </aside>
            )}
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  )
}

export function PlayerHeaderSkeleton() {
  return (
    <section className="hero" aria-busy="true">
      <div className="container hero__inner">
        <div className="hero__who">
          <div className="photo skeleton" />
          <div className="hero__text">
            <div className="skeleton" style={{ width: 120, height: 22 }} />
            <div className="skeleton" style={{ width: 300, height: 70 }} />
            <div className="skeleton" style={{ width: 160, height: 20 }} />
          </div>
        </div>
      </div>
    </section>
  )
}
