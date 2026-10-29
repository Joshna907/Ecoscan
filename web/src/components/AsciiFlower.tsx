import { useEffect, useRef, useState } from 'react'

/** Draw actual monospace characters from the botanical source's alpha and luminance. */
export function AsciiFlower({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const clock = useRef(0)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let disposed = false
    let frame = 0
    let visible = true
    let last = 0
    let cells: { x: number; y: number; density: number }[] = []
    const source = new Image()
    const ramp = ' .,:;i1tfLCG08@'
    let context: CanvasRenderingContext2D | null = null
    const draw = () => {
      if (!context) return
      const ctx = context
      ctx.clearRect(0, 0, 1400, 700)
      ctx.font = 'bold 8px "Courier New", monospace'
      ctx.textAlign = 'center'
      // A full sweep takes about nine seconds. The earlier 14px drift was too
      // small to notice against a wide hero.
      const wave = clock.current / 1450
      // The flower drifts around the headline and reaches down toward the cards.
      // Both forms share one animation loop.
      for (const form of [
        { x: 195, y: 328, scale: 1.42, alpha: .54, phase: 0 },
        { x: 1170, y: 520, scale: .9, alpha: .30, phase: 2.2 },
      ]) {
        const driftX = paused ? 0 : Math.sin(wave + form.phase) * 68
        const driftY = paused ? 0 : Math.cos(wave * .82 + form.phase) * 36
        const tilt = paused ? 0 : Math.sin(wave * .9 + form.phase) * .11
        const cos = Math.cos(tilt)
        const sin = Math.sin(tilt)
        for (const cell of cells) {
          const breathe = paused ? 0 : Math.sin(wave * 1.5 + cell.y / 110 + form.phase) * .035
          const dx = (cell.x - 500) * form.scale * (1 + breathe)
          const dy = (cell.y - 220) * form.scale * (1 + breathe)
          const ripple = paused ? 0 : Math.sin(wave * 2 + cell.y * .026 + form.phase) * 13
          const x = form.x + dx * cos - dy * sin + driftX + ripple
          const y = form.y + dx * sin + dy * cos + driftY
          if (x < -8 || x > 1408 || y < -8 || y > 708) continue
          const shimmer = paused ? 0 : Math.sin(wave * 2.1 + cell.x * .025 + cell.y * .03) * .12
          const shade = Math.max(.08, Math.min(1, cell.density + shimmer))
          ctx.fillStyle = cell.y < 225 ? '#8b6580' : '#617b5d'
          const headlineFade = x > 365 && x < 1050 && y < 430 ? .38 : 1
          ctx.globalAlpha = form.alpha * headlineFade * (.72 + shade * .28)
          ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(shade * (ramp.length - 1)))], x, y)
        }
      }
      ctx.globalAlpha = 1
    }
    const tick = (now: number) => {
      if (disposed || paused || !visible || document.hidden) return
      if (now - last > 65) {
        clock.current += last ? Math.min(now - last, 100) : 0
        last = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      last = 0
      draw()
      if (!paused && visible && !document.hidden && context) frame = requestAnimationFrame(tick)
    }
    source.onload = () => {
      if (disposed) return
      context = element.getContext('2d')
      if (!context) return
      const sample = document.createElement('canvas')
      sample.width = 200; sample.height = 75
      const ctx = sample.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(source, 58, 0, 84, 75)
      const data = ctx.getImageData(0, 0, 200, 75).data
      cells = []
      for (let y = 0; y < 75; y++) for (let x = 0; x < 200; x++) {
        const i = (y * 200 + x) * 4
        const alpha = data[i + 3] / 255
        if (alpha < .16) continue
        const darkness = 1 - (data[i] + data[i + 1] + data[i + 2]) / 765
        cells.push({ x: x * 5, y: y * 6 + 5, density: alpha * Math.pow(.18 + .82 * darkness, .65) })
      }
      setReady(true)
      sync()
    }
    source.src = '/media/ascii-flower-source.png'
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer?.observe(element)
    document.addEventListener('visibilitychange', sync)
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', sync); source.onload = null }
  }, [paused])
  return <div className="ascii-botanical" aria-hidden="true">
    {!ready && <img src="/media/ascii-flower-source.png" alt="" />}
    <canvas ref={canvas} width="1400" height="700" style={{ opacity: ready ? 1 : 0 }} />
  </div>
}
