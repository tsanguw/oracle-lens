import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { StageBackdrop, StageMotion, STAGE_INTERVAL, useChampionStage, type PickRow, type Stage } from './ChampionStage'
import SearchBox from './SearchBox'
import { SlideControls } from './SlideParts'

/*
 * The Versus header: two halves, one per subject, each a slideshow of that subject's signature champions (the same art,
 * weather and depth effect as every other header, see ChampionStage). A diagonal seam carries VS and the head-to-head
 * record. The two slideshows start together and tick together; one pause button stops both.
 */

export type CompareKind = 'players' | 'teams'

export interface HeroSide {
  /** The URL segment: a player's page name or a team's name. */
  page: string
  name: string
  detail: string
  image: ReactNode
  to: string
  /** The champions to show, most played first; undefined until the comparison has loaded. */
  picks: PickRow[] | undefined
}

export interface HeroRecord {
  wins: number
  losses: number
  games: number
}

interface Props {
  kind: CompareKind
  a: HeroSide | null
  b: HeroSide | null
  /** Called with the page name or team name chosen in a half's picker. */
  onPick: (side: 'a' | 'b', value: string) => void
  /** Side A's record against side B; null until it is known. */
  record: HeroRecord | null
}

export default function VersusHero({ kind, a, b, onPick, record }: Props) {
  const stageA = useChampionStage(a?.picks)
  const stageB = useChampionStage(b?.picks)
  const staged = [stageA, stageB].filter((s) => s.staged)
  const paused = staged.length > 0 && staged.every((s) => s.show.userPaused)
  const togglePause = () => {
    for (const s of staged) if (s.show.userPaused === paused) s.show.togglePause()
  }

  return (
    <StageMotion>
      <section className="vs" aria-label={a && b ? `${a.name} versus ${b.name}` : `Choose two ${kind} to compare`}>
        <Half side="a" kind={kind} subject={a} other={b?.page ?? null} stage={stageA} onPick={(v) => onPick('a', v)} />
        <Half side="b" kind={kind} subject={b} other={a?.page ?? null} stage={stageB} onPick={(v) => onPick('b', v)} />
        <div className="vs__seam">
          <span className="vs__vs">VS</span>
          {record && (
            <p className="vs__rec" aria-label={`${record.wins} wins to ${record.losses} in ${record.games} games against each other`}>
              <b>{record.wins}</b>
              <span>{record.games} games</span>
              <b>{record.losses}</b>
            </p>
          )}
        </div>
        {staged.length > 0 && (
          <button type="button" className="vs__pause cmp-btn" aria-pressed={paused} onClick={togglePause}>
            {paused ? 'Play slideshows' : 'Pause slideshows'}
          </button>
        )}
      </section>
    </StageMotion>
  )
}

function Half({
  side,
  kind,
  subject,
  other,
  stage,
  onPick,
}: {
  side: 'a' | 'b'
  kind: CompareKind
  subject: HeroSide | null
  other: string | null
  stage: Stage
  onPick: (value: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const changeRef = useRef<HTMLButtonElement>(null)
  const wasPicking = useRef(false)
  const open = picking || !subject
  const singular = kind === 'players' ? 'player' : 'team'
  const { slides, show, current } = stage

  // The button that opened the picker disappears with it, so focus follows into the box, and back to the button on Cancel.
  useEffect(() => {
    if (picking) inputRef.current?.focus()
    else if (wasPicking.current) changeRef.current?.focus()
    wasPicking.current = picking
  }, [picking])

  return (
    <div className={`vhalf vhalf--${side}${subject ? '' : ' vhalf--empty'}`} ref={stage.headerRef} style={{ '--rc': stage.accent } as CSSProperties}>
      <div className="vhalf__clip" aria-hidden="true">
        <StageBackdrop stage={stage} />
      </div>
      <div className="vhalf__cap">
        {subject && !open && (
          <>
            <div className="vhalf__who">
              <div className="vhalf__img">{subject.image}</div>
              {subject.detail ? <span className="vhalf__detail">{subject.detail}</span> : null}
            </div>
            <Link to={subject.to} className="vhalf__name">
              {subject.name}
            </Link>
            {current ? (
              <div
                className="vhalf__show"
                onPointerEnter={() => show.hold(true)}
                onPointerLeave={() => show.hold(false)}
                onFocus={() => show.hold(true)}
                onBlur={() => show.hold(false)}
              >
                <div role="group" aria-roledescription="slide" aria-label={`${subject.name}, champion ${show.index + 1} of ${show.count}`} aria-live={show.playing ? 'off' : 'polite'} className="vhalf__pick">
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
                {slides.length > 1 && <SlideControls slides={slides} show={show} interval={STAGE_INTERVAL} iconSize={30} showPause={false} />}
              </div>
            ) : null}
            <button ref={changeRef} type="button" className="vhalf__change cmp-btn" onClick={() => setPicking(true)}>
              Change<span className="sr-only"> side {side.toUpperCase()}</span>
            </button>
          </>
        )}
        {open && (
          <div className="vhalf__picker">
            {subject ? null : <p className="vhalf__prompt">Choose a {singular}</p>}
            <SearchBox
              variant="bar"
              inputRef={inputRef}
              pick={{
                kind: kind === 'players' ? 'Players' : 'Teams',
                label: `Search ${kind} for side ${side.toUpperCase()}`,
                exclude: other ?? undefined,
                placeholder: `Search for a ${singular}…`,
                onSelect: (value) => {
                  setPicking(false)
                  onPick(value)
                },
              }}
            />
            {subject && (
              <button type="button" className="cmp-btn" onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
