import { useEffect, useRef } from 'react'

/*
 * A few faint motes drifting up over the hero, tinted by the current card's region. Deliberately quiet:
 * ~40 specks, no glow filters, drawn only while the hero is on screen, the tab is visible and motion is allowed.
 */

type RGB = [number, number, number]

const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface Mote {
  x: number
  y: number
  r: number
  rise: number
  sway: number
  phase: number
  age: number
  life: number
}

const spawn = (w: number, h: number, scatter: boolean): Mote => ({
  x: Math.random() * w,
  y: scatter ? Math.random() * h : h + 10,
  r: 0.8 + Math.random() * 1.9,
  rise: 7 + Math.random() * 16, // px per second
  sway: 6 + Math.random() * 14,
  phase: Math.random() * Math.PI * 2,
  age: scatter ? Math.random() : 0,
  life: 9 + Math.random() * 9, // seconds from birth to fade-out
})

export default function Embers({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef<RGB>(hex(color))
  target.current = hex(color)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let w = 0
    let h = 0
    let motes: Mote[] = []
    let raf = 0
    let last = 0
    let onScreen = true
    const tint: RGB = [...target.current]
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const box = canvas.getBoundingClientRect()
      w = box.width
      h = box.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = w < 720 ? 20 : 42
      motes = Array.from({ length: count }, () => spawn(w, h, true))
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      for (let i = 0; i < 3; i++) tint[i] += (target.current[i] - tint[i]) * Math.min(dt * 1.6, 1)
      ctx.clearRect(0, 0, w, h)
      const [r, g, b] = tint.map(Math.round)
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        m.age += dt / m.life
        if (m.age >= 1 || m.y < -10) {
          motes[i] = spawn(w, h, false)
          continue
        }
        m.y -= m.rise * dt
        const x = m.x + Math.sin(m.phase + m.age * 6) * m.sway
        const fade = Math.sin(Math.PI * m.age) // in, then out
        ctx.fillStyle = `rgba(${r},${g},${b},${0.14 * fade})`
        ctx.beginPath()
        ctx.arc(x, m.y, m.r * 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(${r},${g},${b},${0.7 * fade})`
        ctx.beginPath()
        ctx.arc(x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const start = () => {
      if (raf || !onScreen || document.hidden) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    resize()
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) start()
      else stop()
    })
    observer.observe(canvas)
    const resizer = new ResizeObserver(resize)
    resizer.observe(canvas)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      observer.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="stage__embers" aria-hidden="true" />
}
