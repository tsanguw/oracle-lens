import { useMemo } from 'react'

/*
 * Slow banks of mist drifting across the lower part of the art, tinted by the region's colour. One soft texture is
 * painted once per colour (a few dozen blurred blobs on a small canvas that tiles sideways) and three strips of it
 * slide at different speeds. The sliding is CSS, so it costs next to nothing and stops for reduced motion.
 */

const cache = new Map<string, string>()

function texture(color: string): string {
  const hit = cache.get(color)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const n = parseInt(color.slice(1), 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * 1200
    const y = 40 + Math.random() * 220
    const r = 70 + Math.random() * 120
    for (const off of [-1200, 0, 1200]) {
      // painted three times, a tile apart, so the texture joins up when it repeats
      const g = ctx.createRadialGradient(x + off, y, 0, x + off, y, r)
      g.addColorStop(0, `rgba(${rgb},.13)`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.fillRect(x + off - r, y - r, r * 2, r * 2)
    }
  }
  // fade the texture out toward its top and bottom edges, so a strip of it never shows a straight line
  const edge = ctx.createLinearGradient(0, 0, 0, 300)
  edge.addColorStop(0, 'rgba(0,0,0,0)')
  edge.addColorStop(0.3, 'rgba(0,0,0,1)')
  edge.addColorStop(0.7, 'rgba(0,0,0,1)')
  edge.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, 1200, 300)
  const url = `url(${canvas.toDataURL()})`
  cache.set(color, url)
  return url
}

export default function Mist({ color }: { color: string }) {
  const image = useMemo(() => texture(color), [color])
  return (
    <div className="pstage__mist" aria-hidden="true">
      <i style={{ backgroundImage: image }} />
      <i style={{ backgroundImage: image }} />
      <i style={{ backgroundImage: image }} />
    </div>
  )
}
