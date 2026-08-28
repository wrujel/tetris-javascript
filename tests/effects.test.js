import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBoard } from '../utils/engine.js'
import { BOARD_WIDTH, SHAKE_BASE, SLOWMO_SCALE } from '../utils/constants.js'

// every 2d method the sources call becomes a vi.fn; gradients return an object
function makeFakeCtx () {
  return new Proxy({}, {
    get (t, p) {
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      if (!(p in t)) t[p] = vi.fn()
      return t[p]
    },
    set (t, p, v) { t[p] = v; return true }
  })
}

function fillRow (board, y, color = '#ffd60a') {
  for (let x = 0; x < BOARD_WIDTH; x++) board[y][x] = color
}

function spawnFourRows (fx) {
  const board = createBoard()
  for (let y = 26; y < 30; y++) fillRow(board, y)
  fx.spawnLineClear([26, 27, 28, 29], board, 800, 'TETRIS!')
}

let now
let ctx
let mod

beforeEach(async () => {
  vi.resetModules()
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  ctx = makeFakeCtx()
  mod = await import('../utils/effects.js')
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.matchMedia
})

describe('spawnLineClear', () => {
  it('spawns particles, flashes and a labeled popup', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 28)
    fillRow(board, 29)
    fx.spawnLineClear([28, 29], board, 300, 'COMBO x2')
    expect(fx.updateEffects(0)).toBe(true)
    fx.drawEffects()
    expect(ctx.fillText).toHaveBeenCalledWith('COMBO x2 +300', BOARD_WIDTH / 2, expect.any(Number))
  })

  it('falls back to white for empty cells and a plain points popup', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    board[29][0] = '#ffd60a'
    fx.spawnLineClear([29], board, 100)
    expect(fx.updateEffects(0)).toBe(true)
    fx.drawEffects()
    expect(ctx.fillText).toHaveBeenCalledWith('+100', BOARD_WIDTH / 2, expect.any(Number))
    expect(ctx.font.startsWith('1px')).toBe(true)
  })

  it('shrinks the popup font when the text is long', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 29)
    fx.spawnLineClear([29], board, 1200, 'B2B TETRIS!')
    fx.drawEffects()
    expect(ctx.fillText).toHaveBeenCalledWith('B2B TETRIS! +1200', BOARD_WIDTH / 2, expect.any(Number))
    expect(ctx.font.startsWith('0.65px')).toBe(true)
  })
})

describe('drawEffects', () => {
  it('draws beams, shockwaves, shards and popups through the context', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 29)
    fx.spawnLineClear([29], board, 100)
    fx.drawEffects()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.arc).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.translate).toHaveBeenCalled()
    expect(ctx.rotate).toHaveBeenCalled()
  })
})

describe('updateEffects', () => {
  it('stays active right after spawning and eventually settles', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 29)
    fx.spawnLineClear([29], board, 100)
    expect(fx.updateEffects(0)).toBe(true)
    let active = true
    let steps = 0
    while (active && steps < 100) {
      active = fx.updateEffects(100)
      steps++
    }
    expect(active).toBe(false)
  })
})

describe('slow motion', () => {
  it('dips the time scale after a 4-row clear and eases back to 1', () => {
    const fx = mod.createEffects(ctx)
    expect(fx.getTimeScale()).toBe(1)
    spawnFourRows(fx)
    expect(fx.getTimeScale()).toBeLessThan(1)
    now = 100
    const dipping = fx.getTimeScale()
    expect(dipping).toBeGreaterThanOrEqual(SLOWMO_SCALE)
    expect(dipping).toBeLessThan(1)
    now = 400
    const easing = fx.getTimeScale()
    expect(easing).toBeGreaterThan(SLOWMO_SCALE)
    expect(easing).toBeLessThan(1)
    now = 501
    expect(fx.getTimeScale()).toBe(1)
  })

  it('never engages with reduced motion', async () => {
    vi.resetModules()
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const reduced = await import('../utils/effects.js')
    const fx = reduced.createEffects(ctx)
    spawnFourRows(fx)
    expect(fx.getTimeScale()).toBe(1)
    expect(fx.getShakeOffset()).toEqual({ x: 0, y: 0 })
  })
})

describe('screen shake', () => {
  it('returns offsets within the shake magnitude right after a clear', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 29)
    fx.spawnLineClear([29], board, 100)
    const offset = fx.getShakeOffset()
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(SHAKE_BASE)
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(SHAKE_BASE)
  })

  it('decays to zero once the shake expires', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    fillRow(board, 29)
    fx.spawnLineClear([29], board, 100)
    fx.updateEffects(400)
    expect(fx.getShakeOffset()).toEqual({ x: 0, y: 0 })
  })
})

describe('spawnBoardClear', () => {
  it('bursts only the filled cells and arms a bigger shake', () => {
    const fx = mod.createEffects(ctx)
    const board = createBoard()
    board[29][0] = '#ffd60a'
    board[29][5] = '#00e5ff'
    board[0][7] = '#c77dff'
    fx.spawnBoardClear(board)
    expect(fx.updateEffects(0)).toBe(true)
    fx.drawEffects()
    expect(ctx.fillRect).toHaveBeenCalled()
    const offset = fx.getShakeOffset()
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(SHAKE_BASE * 3)
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(SHAKE_BASE * 3)
  })
})
