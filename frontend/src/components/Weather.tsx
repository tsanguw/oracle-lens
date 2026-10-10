import { useEffect, useRef } from 'react'

/*
 * Weather by region: each Legends of Runeterra region has its own faint atmosphere drifting over the art, such as
 * snow for Freljord, petals for Ionia, steam and sparks for Piltover & Zaun. A few dozen specks at most, drawn only
 * while the header is on screen and the tab is visible, and not at all when motion is reduced. When the region
 * changes the old weather fades out and the new one fades in.
 */

type Kind = 'snow' | 'ash' | 'petal' | 'wisp' | 'steam' | 'dust' | 'sand' | 'star' | 'rain' | 'sparkle'
type RGB = [number, number, number]

const KINDS: Record<string, [Kind, string, number]> = {
  Freljord: ['snow', '#ffffff', 90],
  Noxus: ['ash', '#ff6b4a', 54],
  Ionia: ['petal', '#ffb3d1', 34],
  ShadowIsles: ['wisp', '#6ff2d0', 38],
  PiltoverZaun: ['steam', '#ffbf5a', 46],
  Demacia: ['dust', '#ffe9a3', 48],
  Shurima: ['sand', '#f3d27a', 70],
  Targon: ['star', '#c9bfff', 95],
  Bilgewater: ['rain', '#a8d8ff', 70],
  BandleCity: ['sparkle', '#c8ff9a', 64],
  Runeterra: ['ash', '#e8d8ff', 36],
}

const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface Mote {
  x: number
  y: number
  ph: number
  r: number
  vx: number
  vy: number
  age: number
  life: number
  len: number
  sub: 'steam' | 'spark'
}

const R = Math.random
const TAU = Math.PI * 2

export default function Weather({ region }: { region: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setRegion = useRef<(region: string) => void>(() => {})
  const initial = useRef(region)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let w = 0
    let h = 0
    let motes: Mote[] = []
    let kind: Kind = 'ash'
    let col: RGB = [255, 255, 255]
    let count = 40
    let fade = 0
    let fadeTo = 1
    let raf = 0
    let last = 0
    let t = 0
    let onScreen = true
    let shoot: { x: number; y: number; age: number } | null = null
    let swapTimer = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const make = (first: boolean): Mote => {
      const m: Mote = { x: R() * w, y: first ? R() * h : -10, ph: R() * TAU, r: 1, vx: 0, vy: 0, age: first ? R() : 0, life: 8, len: 8, sub: 'steam' }
      switch (kind) {
        case 'snow':
          m.r = 1 + R() * R() * 3.4
          m.vy = 24 + m.r * 16 + R() * 20
          m.vx = -6 + R() * 12
          m.y = first ? R() * h : -8
          break
        case 'ash':
          m.r = 0.8 + R() * 1.8
          m.vy = -(10 + R() * 26)
          m.vx = 6 + R() * 14
          m.y = first ? R() * h : h + 8
          m.life = 7 + R() * 7
          break
        case 'petal':
          m.r = 3 + R() * 3
          m.vy = 26 + R() * 30
          m.vx = 22 + R() * 40
          m.x = first ? R() * w : -12
          m.y = first ? R() * h : R() * h * 0.5
          break
        case 'wisp':
          m.r = 10 + R() * 22
          m.vy = -(4 + R() * 9)
          m.vx = -3 + R() * 6
          m.y = first ? R() * h : h + 20
          m.life = 9 + R() * 8
          break
        case 'steam':
          if (R() < 0.6) {
            m.sub = 'steam'
            m.r = 22 + R() * 30
            m.vy = -(10 + R() * 16)
            m.vx = 3 + R() * 8
            m.y = first ? R() * h : h + 30
            m.life = 8 + R() * 6
          } else {
            m.sub = 'spark'
            m.x = w * (0.45 + R() * 0.5)
            m.y = h * (0.55 + R() * 0.45)
            m.vx = 60 + R() * 150
            m.vy = -(40 + R() * 150)
            m.life = 0.7 + R() * 1.1
          }
          break
        case 'dust':
          m.r = 0.8 + R() * 1.8
          m.vx = 6 + R() * 14
          m.vy = -(3 + R() * 9)
          m.life = 10 + R() * 8
          break
        case 'sand':
          m.r = 0.8 + R()
          m.vx = 130 + R() * 160
          m.vy = 4 + R() * 24
          m.x = first ? R() * w : -20
          m.len = 6 + R() * 14
          break
        case 'star':
          m.r = 0.8 + R() * 1.9
          m.life = 3 + R() * 5
          m.y = R() * h * 0.8
          break
        case 'rain':
          m.vy = 560 + R() * 220
          m.vx = -150
          m.len = 14 + R() * 14
          m.x = R() * (w + 200)
          m.y = first ? R() * h : -30
          break
        case 'sparkle':
          m.r = 4 + R() * 7
          m.life = 1.4 + R() * 1.6
          break
      }
      return m
    }
    const seed = () => {
      motes = Array.from({ length: w < 720 ? Math.round(count * 0.5) : count }, () => make(true))
    }
    const resize = () => {
      const box = canvas.getBoundingClientRect()
      w = box.width
      h = box.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const draw = (p: Mote, dt: number) => {
      const f = Math.min(1, Math.max(0, Math.sin(Math.PI * Math.min(p.age, 1)))) // fade in, then out over a life
      const c = `rgba(${col.join(',')},`
      ctx.fillStyle = `${c}1)`
      const respawn = () => Object.assign(p, make(false))
      switch (kind) {
        case 'snow':
          p.x += (p.vx + Math.sin(t * 0.8 + p.ph) * 14) * dt
          p.y += p.vy * dt
          ctx.globalAlpha = (0.35 + p.r * 0.14) * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, TAU)
          ctx.fill()
          if (p.y > h + 10) respawn()
          break
        case 'ash':
        case 'dust': {
          p.age += dt / p.life
          p.x += (p.vx + Math.sin(t + p.ph) * 8) * dt
          p.y += p.vy * dt
          const tw = kind === 'dust' ? 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + p.ph)) : 0.6 + 0.4 * Math.sin(t * 5 + p.ph)
          ctx.globalAlpha = 0.14 * f * fade * tw
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r * 3.4, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = 0.8 * f * fade * tw
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, TAU)
          ctx.fill()
          if (p.age >= 1) respawn()
          break
        }
        case 'petal':
          p.x += (p.vx + Math.sin(t * 1.4 + p.ph) * 18) * dt
          p.y += p.vy * dt
          ctx.globalAlpha = 0.62 * fade
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.ph + t * 1.1)
          ctx.beginPath()
          ctx.ellipse(0, 0, p.r * 1.7, p.r * 0.8, 0, 0, TAU)
          ctx.fill()
          ctx.restore()
          if (p.y > h + 12 || p.x > w + 12) respawn()
          break
        case 'wisp':
          p.age += dt / p.life
          p.x += (p.vx + Math.sin(t * 0.6 + p.ph) * 10) * dt
          p.y += p.vy * dt
          ctx.globalAlpha = 0.085 * f * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = 0.55 * f * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.6, 0, TAU)
          ctx.fill()
          if (p.age >= 1) respawn()
          break
        case 'steam':
          p.age += dt / p.life
          if (p.sub === 'steam') {
            p.x += (p.vx + Math.sin(t * 0.5 + p.ph) * 6) * dt
            p.y += p.vy * dt
            ctx.globalAlpha = 0.05 * f * fade
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r * (1 + p.age * 0.9), 0, TAU)
            ctx.fill()
          } else {
            p.vy += 140 * dt
            p.x += p.vx * dt
            p.y += p.vy * dt
            ctx.globalAlpha = 0.9 * (1 - p.age) * fade
            ctx.strokeStyle = `${c}1)`
            ctx.lineWidth = 1.4
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045)
            ctx.stroke()
          }
          if (p.age >= 1) respawn()
          break
        case 'sand':
          p.x += p.vx * dt
          p.y += p.vy * dt
          ctx.globalAlpha = 0.3 * fade
          ctx.strokeStyle = `${c}1)`
          ctx.lineWidth = p.r
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.len, p.y - p.len * 0.08)
          ctx.stroke()
          if (p.x > w + 20) respawn()
          break
        case 'star':
          ctx.globalAlpha = (0.15 + 0.85 * Math.abs(Math.sin(t * 0.9 + p.ph))) * 0.85 * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, TAU)
          ctx.fill()
          break
        case 'rain':
          p.x += p.vx * dt
          p.y += p.vy * dt
          ctx.globalAlpha = 0.24 * fade
          ctx.strokeStyle = `${c}1)`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03)
          ctx.stroke()
          if (p.y > h + 30) respawn()
          break
        case 'sparkle': {
          p.age += dt / p.life
          const s = p.r * Math.sin(Math.PI * Math.min(p.age, 1))
          ctx.globalAlpha = 0.85 * fade
          ctx.beginPath()
          ctx.moveTo(p.x - s, p.y)
          ctx.lineTo(p.x, p.y - s * 0.25)
          ctx.lineTo(p.x + s, p.y)
          ctx.lineTo(p.x, p.y + s * 0.25)
          ctx.closePath()
          ctx.moveTo(p.x, p.y - s)
          ctx.lineTo(p.x + s * 0.25, p.y)
          ctx.lineTo(p.x, p.y + s)
          ctx.lineTo(p.x - s * 0.25, p.y)
          ctx.closePath()
          ctx.fill()
          if (p.age >= 1) {
            respawn()
            p.x = R() * w
            p.y = R() * h
          }
          break
        }
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      t += dt
      fade += (fadeTo - fade) * Math.min(dt * 2.4, 1)
      ctx.clearRect(0, 0, w, h)
      if (fade < 0.01) return
      if (kind === 'star') {
        if (!shoot && R() < dt * 0.25) shoot = { x: R() * w * 0.8, y: R() * h * 0.4, age: 0 }
        if (shoot) {
          shoot.age += dt / 0.9
          shoot.x += 520 * dt
          shoot.y += 240 * dt
          ctx.globalAlpha = (1 - shoot.age) * fade
          ctx.strokeStyle = `rgba(${col.join(',')},1)`
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(shoot.x, shoot.y)
          ctx.lineTo(shoot.x - 70, shoot.y - 32)
          ctx.stroke()
          if (shoot.age >= 1) shoot = null
        }
      }
      motes.forEach((p) => draw(p, dt))
      ctx.globalAlpha = 1
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
    const apply = (name: string, instant: boolean) => {
      const [k, color, n] = KINDS[name] ?? KINDS.Runeterra
      const swap = () => {
        kind = k
        col = hex(color)
        count = n
        shoot = null
        seed()
        fadeTo = 1
      }
      clearTimeout(swapTimer)
      if (instant) swap()
      else {
        fadeTo = 0
        swapTimer = window.setTimeout(swap, 450)
      }
    }
    setRegion.current = (name) => apply(name, false)

    resize()
    apply(initial.current, true)
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
      clearTimeout(swapTimer)
      observer.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      setRegion.current = () => {}
    }
  }, [])

  useEffect(() => {
    setRegion.current(region)
  }, [region])

  return <canvas ref={canvasRef} className="pstage__weather" aria-hidden="true" />
}
