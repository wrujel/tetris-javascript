import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBoard } from '../utils/engine.js'
import { createPiece } from '../utils/pieces.js'
import { BOARD_WIDTH, BOARD_HEIGHT, BLOCK_SIZE } from '../utils/constants.js'

// every 2d method the sources call becomes a vi.fn; gradients return an object
function makeFakeCtx () {
  const sets = []
  return new Proxy({}, {
    get (t, p) {
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      if (p === '__sets') return sets
      if (!(p in t)) t[p] = vi.fn()
      return t[p]
    },
    set (t, p, v) { sets.push([p, v]); t[p] = v; return true }
  })
}

const countCells = piece => piece.shape.flat().filter(v => v === 1).length

let ctx
let mod

beforeEach(async () => {
  vi.resetModules()
  document.body.innerHTML = '<canvas id="next"></canvas><canvas id="next-vs"></canvas><canvas id="hold"></canvas><canvas id="board"></canvas>'
  ctx = makeFakeCtx()
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  mod = await import('../utils/canvas.js')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('module wiring', () => {
  it('grabs the preview canvases and scales their contexts at import', () => {
    expect(ctx.scale).toHaveBeenCalledTimes(3)
    expect(ctx.scale).toHaveBeenCalledWith(BLOCK_SIZE, BLOCK_SIZE)
    expect(document.getElementById('next').width).toBe(BLOCK_SIZE * 4)
    expect(document.getElementById('next').height).toBe(BLOCK_SIZE * 12)
    expect(document.getElementById('next-vs').width).toBe(BLOCK_SIZE * 4)
    expect(document.getElementById('next-vs').height).toBe(BLOCK_SIZE * 12)
    expect(document.getElementById('hold').width).toBe(BLOCK_SIZE * 4)
    expect(document.getElementById('hold').height).toBe(BLOCK_SIZE * 4)
  })
})

describe('createBoardRenderer', () => {
  it('sizes the canvas and scales the context at the default block size', () => {
    const canvas = document.getElementById('board')
    mod.createBoardRenderer(canvas)
    expect(canvas.width).toBe(280)
    expect(canvas.height).toBe(600)
    expect(ctx.scale).toHaveBeenCalledWith(BLOCK_SIZE, BLOCK_SIZE)
  })

  it('honours a custom block size', () => {
    const canvas = document.getElementById('board')
    mod.createBoardRenderer(canvas, 10)
    expect(canvas.width).toBe(140)
    expect(canvas.height).toBe(300)
    expect(ctx.scale).toHaveBeenCalledWith(10, 10)
  })

  it('draws the background and grid on an empty board', () => {
    const canvas = document.getElementById('board')
    const renderer = mod.createBoardRenderer(canvas)
    renderer.draw({ board: createBoard(), piece: null, clearingRows: null })
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('draws settled sprites and flashes clearing rows white', () => {
    const canvas = document.getElementById('board')
    const renderer = mod.createBoardRenderer(canvas)
    const board = createBoard()
    board[29][0] = '#ffd60a'
    board[29][1] = '#ffd60a'
    board[28][0] = '#ffd60a'
    renderer.draw({ board, piece: null, clearingRows: null }) // warm the sprite cache
    ctx.drawImage.mockClear()
    ctx.__sets.length = 0
    renderer.draw({ board, piece: null, clearingRows: [29] })
    expect(ctx.drawImage).toHaveBeenCalledTimes(3)
    const flashes = ctx.__sets.filter(([prop, value]) =>
      prop === 'fillStyle' && typeof value === 'string' && value.startsWith('rgba(255, 255, 255,')
    )
    expect(flashes.length).toBe(2)
  })

  it('draws the ghost and the active piece sprites', () => {
    const canvas = document.getElementById('board')
    const renderer = mod.createBoardRenderer(canvas)
    const board = createBoard()
    const piece = createPiece('T')
    renderer.draw({ board, piece: null, clearingRows: null })
    const base = ctx.drawImage.mock.calls.length
    renderer.draw({ board, piece, clearingRows: null })
    expect(ctx.drawImage.mock.calls.length - base).toBe(countCells(piece) * 2)
    // drawing again hits the cached block and ghost sprites
    renderer.draw({ board, piece, clearingRows: null })
    expect(ctx.drawImage.mock.calls.length - base).toBe(countCells(piece) * 4)
  })

  it('reuses cached block sprites for repeated colors', () => {
    const canvas = document.getElementById('board')
    const renderer = mod.createBoardRenderer(canvas)
    const board = createBoard()
    board[29][0] = '#ffd60a'
    board[29][1] = '#ffd60a'
    renderer.draw({ board, piece: null, clearingRows: null })
    renderer.draw({ board, piece: null, clearingRows: null })
    expect(ctx.drawImage).toHaveBeenCalledTimes(4)
  })
})

describe('drawQueue', () => {
  it('clears both preview contexts and draws only the first 3 pieces', () => {
    const pieces = ['I', 'O', 'T', 'L', 'J'].map(createPiece)
    ctx.clearRect.mockClear()
    ctx.drawImage.mockClear()
    mod.drawQueue(pieces)
    expect(ctx.clearRect).toHaveBeenCalledTimes(2)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 4, 12)
    const cells = pieces.slice(0, 3).reduce((sum, p) => sum + countCells(p), 0)
    expect(ctx.drawImage).toHaveBeenCalledTimes(cells * 2)
  })
})

describe('drawHold', () => {
  it('only clears the box when there is no held piece', () => {
    ctx.clearRect.mockClear()
    ctx.drawImage.mockClear()
    mod.drawHold(null, true)
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 4, 4)
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('dims the held piece while hold is locked out', () => {
    ctx.drawImage.mockClear()
    mod.drawHold(createPiece('I'), false)
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.globalAlpha).toBe(0.3)
    expect(ctx.drawImage).toHaveBeenCalledTimes(countCells(createPiece('I')))
  })

  it('draws the held piece at full alpha when hold is available', () => {
    mod.drawHold(createPiece('I'), true)
    expect(ctx.globalAlpha).toBe(1)
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })
})
