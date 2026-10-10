import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useSlideshow'

/** How strongly the art's layers move against each other (1 is the strongest the lab offered; this is the "subtle" setting). */
export const DEPTH = 0.8

/**
 * Depth parallax: writes the pointer's position, smoothed, to --ox and --oy (each -0.5 to 0.5) on the art element.
 * CSS moves the far and near layers by different amounts from those. With no mouse over the header the art drifts on
 * its own, very gently. Does nothing on touch screens or when motion is reduced, and stops while off screen.
 */
export function useDepthPointer(header: HTMLElement | null, art: HTMLElement | null): void {
  useEffect(() => {
    if (!header || !art || prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    art.style.setProperty('--depth', String(DEPTH))
    let tx = 0.62
    let ty = 0.45
    let px = tx
    let py = ty
    let mouse = false
    let raf = 0
    let onScreen = true
    const t0 = performance.now()

    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouse = true
      const box = header.getBoundingClientRect()
      tx = (e.clientX - box.left) / box.width
      ty = (e.clientY - box.top) / box.height
    }
    const leave = () => {
      mouse = false
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!mouse) {
        const s = (now - t0) / 1000
        tx = 0.62 + Math.sin(s * 0.35) * 0.18
        ty = 0.45 + Math.cos(s * 0.27) * 0.14
      }
      px += (tx - px) * 0.06
      py += (ty - py) * 0.06
      art.style.setProperty('--ox', (px - 0.5).toFixed(4))
      art.style.setProperty('--oy', (py - 0.5).toFixed(4))
    }
    const start = () => {
      if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) start()
      else stop()
    })
    observer.observe(header)
    const onVisibility = () => (document.hidden ? stop() : start())
    header.addEventListener('pointermove', move)
    header.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', onVisibility)
    start()
    return () => {
      stop()
      observer.disconnect()
      header.removeEventListener('pointermove', move)
      header.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      art.style.removeProperty('--ox')
      art.style.removeProperty('--oy')
    }
  }, [header, art])
}

/** Scroll parallax: keeps the page's scroll position (0 to 900) in --sy on the header; CSS drifts the art and text from it. */
export function useScrollVar(header: HTMLElement | null): void {
  useEffect(() => {
    if (!header || prefersReducedMotion()) return
    let raf = 0
    let queued = false
    const update = () => {
      queued = false
      header.style.setProperty('--sy', String(Math.max(0, Math.min(window.scrollY, 900))))
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      header.style.removeProperty('--sy')
    }
  }, [header])
}

/**
 * When the header's text and numbers should rise into place: shortly after the art has started to appear (or after a few
 * seconds if it never does). True straight away when there is no art or motion is reduced, so nothing is ever hidden.
 */
export function useEntrance(artReady: boolean, hasArt: boolean): boolean {
  const [entered, setEntered] = useState(() => !hasArt || prefersReducedMotion())
  useEffect(() => {
    if (!hasArt || prefersReducedMotion()) {
      setEntered(true)
      return
    }
    const timer = window.setTimeout(() => setEntered(true), artReady ? 700 : 4000)
    return () => clearTimeout(timer)
  }, [artReady, hasArt])
  return entered
}

/** A number that counts up from zero once `run` is true (the first time only; later changes just show the new value). */
export function useCountUp(target: number | null | undefined, run: boolean): number | null {
  const finished = useRef(prefersReducedMotion())
  const [value, setValue] = useState<number | null>(() => (target == null ? null : finished.current ? target : 0))
  useEffect(() => {
    if (target == null) {
      setValue(null)
      return
    }
    if (finished.current) {
      setValue(target)
      return
    }
    if (!run) {
      setValue(0)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100)
      setValue(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
      else finished.current = true
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, run])
  return value
}
