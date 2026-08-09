import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  PARTICLES_PER_CELL,
  PARTICLE_GRAVITY,
  PARTICLE_LIFE,
  SHAKE_BASE,
  SLOWMO_SCALE,
  SLOWMO_DURATION
} from './constants.js'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// per-board effects instance (particles, flashes, popups, shake, slow-mo)
export function createEffects (context) {
  let particles = []
  let flashes = []
  let popups = []
  let shake = { magnitude: 0, elapsed: 0, duration: 1 }
  let slowmoUntil = 0

  function createShard (x, y, color) {
    return {
      x: x + 0.5,
      y: y + 0.5,
      vx: (Math.random() - 0.5) * 0.025,
      vy: -(Math.random() * 0.025 + 0.008),
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.02,
      size: Math.random() * 0.28 + 0.12,
      color,
      age: 0,
      life: PARTICLE_LIFE + Math.random() * 400
    }
  }

  // explode cleared rows into physical shards + flash + score popup
  function spawnLineClear (rows, board, points, label = null) {
    rows.forEach(y => {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const color = board[y][x] || '#ffffff'
        for (let i = 0; i < PARTICLES_PER_CELL; i++) {
          particles.push(createShard(x, y, color))
        }
      }
      flashes.push({ y, age: 0, life: 300 })
    })

    const count = rows.length
    shake = { magnitude: SHAKE_BASE * count, elapsed: 0, duration: 350 }

    const text = label ? `${label} +${points}` : `+${points}`
    popups.push({ text, y: rows[0] - 0.5, age: 0, life: 900 })

    if (count === 4 && !reduceMotion) slowmoUntil = performance.now() + SLOWMO_DURATION
  }

  // full-board burst used on game over
  function spawnBoardClear (board) {
    board.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          for (let i = 0; i < 3; i++) {
            particles.push(createShard(x, y, value))
          }
        }
      })
    })
    shake = { magnitude: SHAKE_BASE * 3, elapsed: 0, duration: 500 }
  }

  // advance effect lifecycles; returns true while anything is still active
  function updateEffects (dt) {
    particles.forEach(p => {
      p.age += dt
      p.vy += PARTICLE_GRAVITY * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.vr * dt
    })
    particles = particles.filter(p => p.age < p.life && p.y < BOARD_HEIGHT + 2)

    flashes.forEach(f => { f.age += dt })
    flashes = flashes.filter(f => f.age < f.life)

    popups.forEach(p => {
      p.age += dt
      p.y -= dt * 0.003
    })
    popups = popups.filter(p => p.age < p.life)

    shake.elapsed += dt

    return (
      particles.length + flashes.length + popups.length > 0 ||
      shake.elapsed < shake.duration
    )
  }

  function drawEffects () {
    flashes.forEach(f => {
      const t = f.age / f.life
      const alpha = 1 - t

      // beam across the cleared row
      context.save()
      context.globalAlpha = alpha * 0.9
      context.fillStyle = '#ffffff'
      context.shadowColor = '#ffffff'
      context.shadowBlur = 12
      context.fillRect(0, f.y + 0.35, BOARD_WIDTH, 0.3)
      context.restore()

      // shockwave ring
      context.save()
      context.globalAlpha = alpha * 0.5
      context.strokeStyle = '#ffffff'
      context.lineWidth = 0.08
      context.beginPath()
      context.arc(BOARD_WIDTH / 2, f.y + 0.5, 0.5 + t * 7, 0, Math.PI * 2)
      context.stroke()
      context.restore()
    })

    particles.forEach(p => {
      const t = p.age / p.life
      context.save()
      context.globalAlpha = Math.max(0, 1 - t)
      context.translate(p.x, p.y)
      context.rotate(p.rotation)
      context.fillStyle = p.color
      context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
      context.restore()
    })

    popups.forEach(p => {
      const t = p.age / p.life
      context.save()
      context.globalAlpha = Math.max(0, 1 - t * t)
      context.fillStyle = '#ffffff'
      context.shadowColor = '#00e5ff'
      context.shadowBlur = 10
      // shrink long labels so they fit the board width
      const size = p.text.length > 10 ? 0.65 : 1
      context.font = `${size}px "Press Start 2P", monospace`
      context.textAlign = 'center'
      context.fillText(p.text, BOARD_WIDTH / 2, p.y)
      context.restore()
    })
  }

  // decaying random offset, in px, applied as a CSS transform by the caller
  function getShakeOffset () {
    if (reduceMotion || shake.elapsed >= shake.duration) return { x: 0, y: 0 }
    const magnitude = shake.magnitude * (1 - shake.elapsed / shake.duration)
    return {
      x: (Math.random() - 0.5) * 2 * magnitude,
      y: (Math.random() - 0.5) * 2 * magnitude
    }
  }

  // 1 normally, dips to SLOWMO_SCALE during the slow-mo window, eases back
  function getTimeScale () {
    const remaining = slowmoUntil - performance.now()
    if (remaining <= 0) return 1
    const ease = Math.min(1, remaining / 200)
    return 1 - (1 - SLOWMO_SCALE) * ease
  }

  return {
    spawnLineClear,
    spawnBoardClear,
    updateEffects,
    drawEffects,
    getShakeOffset,
    getTimeScale
  }
}
