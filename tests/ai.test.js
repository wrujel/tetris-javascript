import { describe, it, expect, vi } from 'vitest'
import { bestPlacement, createAiController } from '../utils/ai.js'
import { createBoard, createEngine } from '../utils/engine.js'
import { createPiece } from '../utils/pieces.js'
import { BOARD_WIDTH, BOARD_HEIGHT, AI_ACTION_MS } from '../utils/constants.js'

// board filled wherever fill(x, y) returns true
function filledBoard (fill) {
  const board = createBoard()
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (fill(x, y)) board[y][x] = 1
    }
  }
  return board
}

// bottom 10 rows filled except a deep 1-wide well at x = 6
function wellBoard () {
  return filledBoard((x, y) => y >= BOARD_HEIGHT - 10 && x !== 6)
}

// minimal engine double: createAiController only touches these members
function mockEngine (overrides = {}) {
  return {
    gameOver: false,
    clearing: null,
    piece: null,
    board: createBoard(),
    rotate: vi.fn(),
    move: vi.fn(),
    hardDrop: vi.fn(),
    ...overrides
  }
}

function actionCount (engine) {
  return (
    engine.rotate.mock.calls.length +
    engine.move.mock.calls.length +
    engine.hardDrop.mock.calls.length
  )
}

describe('bestPlacement', () => {
  it('finds a deterministic placement on an empty board', () => {
    for (const type of ['I', 'T']) {
      const board = createBoard()
      const piece = createPiece(type)
      const first = bestPlacement(board, piece)
      expect(first).not.toBeNull()
      expect(Number.isFinite(first.score)).toBe(true)
      expect(bestPlacement(board, piece)).toEqual(first)
    }
  })

  it('drops a vertical I into a deep 1-wide well', () => {
    const best = bestPlacement(wellBoard(), createPiece('I'))
    expect(best).not.toBeNull()
    expect(best.rotations % 2).toBe(1)
    expect(best.x).toBe(6)
  })

  it('rewards completing a row', () => {
    // rows 20-29 filled except a well at x = 6, plus a second gap at x = 9
    // above the bottom row so only row 29 can complete: a vertical I at
    // x = 6 clears it
    const board = filledBoard((x, y) => {
      if (y < BOARD_HEIGHT - 10) return false
      if (x === 6) return false
      if (x === 9 && y < BOARD_HEIGHT - 1) return false
      return true
    })
    const best = bestPlacement(board, createPiece('I'))
    expect(best).not.toBeNull()
    expect(best.rotations % 2).toBe(1)
    expect(best.x).toBe(6)
  })

  it('handles boards with holes and edge wells', () => {
    // full columns at x = 1 and x = 12 (edge wells at x = 0 and x = 13)
    // plus a floating cell leaving holes underneath
    const board = filledBoard(x => x === 1 || x === 12)
    board[BOARD_HEIGHT - 5][6] = 1
    const best = bestPlacement(board, createPiece('I'))
    expect(best).not.toBeNull()
    expect(Number.isFinite(best.score)).toBe(true)
  })

  it('skips candidates that collide at spawn', () => {
    // tall stack at columns 0-3 blocks every spawn position with x < 4
    const board = filledBoard(x => x <= 3)
    const best = bestPlacement(board, createPiece('I'))
    expect(best).not.toBeNull()
    expect(best.x).toBeGreaterThanOrEqual(4)
  })

  it('returns null when nothing fits', () => {
    const board = filledBoard(() => true)
    expect(bestPlacement(board, createPiece('I'))).toBeNull()
  })
})

describe('createAiController', () => {
  it('does nothing when the game is over', () => {
    const engine = mockEngine({ gameOver: true, piece: createPiece('I') })
    createAiController(engine).step(1000)
    expect(actionCount(engine)).toBe(0)
  })

  it('does nothing while a clear animation is running', () => {
    const engine = mockEngine({
      clearing: { rows: [BOARD_HEIGHT - 1], until: 1234 },
      piece: createPiece('I')
    })
    createAiController(engine).step(1000)
    expect(actionCount(engine)).toBe(0)
  })

  it('does nothing without an active piece', () => {
    const engine = mockEngine({ piece: null })
    createAiController(engine).step(1000)
    expect(actionCount(engine)).toBe(0)
  })

  it('does nothing when no placement exists', () => {
    const engine = mockEngine({
      board: filledBoard(() => true),
      piece: createPiece('I')
    })
    const controller = createAiController(engine)
    controller.step(1000)
    controller.step(2000)
    expect(actionCount(engine)).toBe(0)
  })

  it('gates actions to AI_ACTION_MS', () => {
    const piece = createPiece('O')
    const engine = mockEngine({ piece })
    const controller = createAiController(engine)

    controller.step(AI_ACTION_MS - 1) // lastAction starts at 0: too early
    expect(actionCount(engine)).toBe(0)

    controller.step(AI_ACTION_MS) // first action fires
    expect(actionCount(engine)).toBe(1)

    controller.step(2 * AI_ACTION_MS - 1) // not enough time since last action
    expect(actionCount(engine)).toBe(1)

    controller.step(2 * AI_ACTION_MS)
    expect(actionCount(engine)).toBe(2)
  })

  it('rotates toward the target orientation before moving', () => {
    const board = wellBoard()
    const piece = createPiece('I')
    const engine = mockEngine({ board, piece })
    const controller = createAiController(engine)
    const target = bestPlacement(board, piece)
    expect(target.rotations).toBeGreaterThan(0)

    for (let i = 0; i < target.rotations; i++) {
      controller.step(AI_ACTION_MS * (i + 1))
      expect(engine.rotate).toHaveBeenCalledTimes(i + 1)
    }
    expect(engine.move).not.toHaveBeenCalled()

    // rotations done: piece spawns at x = 5, left of the well at x = 6
    controller.step(AI_ACTION_MS * (target.rotations + 1))
    expect(engine.move).toHaveBeenCalledTimes(1)
    expect(engine.move).toHaveBeenLastCalledWith(1)
  })

  it('moves right, left, then hard drops on target', () => {
    const board = createBoard()
    const piece = createPiece('O')
    const engine = mockEngine({ board, piece })
    const controller = createAiController(engine)
    const target = bestPlacement(board, piece)
    expect(target.rotations).toBe(0) // O rotations are all identical

    piece.position.x = target.x - 2
    controller.step(AI_ACTION_MS)
    expect(engine.move).toHaveBeenLastCalledWith(1)

    piece.position.x = target.x + 2
    controller.step(2 * AI_ACTION_MS)
    expect(engine.move).toHaveBeenLastCalledWith(-1)

    piece.position.x = target.x
    controller.step(3 * AI_ACTION_MS)
    expect(engine.hardDrop).toHaveBeenCalledTimes(1)
  })

  it('recomputes the target when a new piece spawns', () => {
    const board = wellBoard()
    const engine = mockEngine({ board, piece: createPiece('I') })
    const controller = createAiController(engine)
    const target = bestPlacement(board, engine.piece)
    expect(target.rotations).toBeGreaterThan(0)

    // exhaust the rotations for the first piece
    for (let i = 0; i < target.rotations; i++) {
      controller.step(AI_ACTION_MS * (i + 1))
    }
    expect(engine.rotate).toHaveBeenCalledTimes(target.rotations)

    // swap in a fresh piece object: rotations start over
    engine.piece = createPiece('I')
    controller.step(AI_ACTION_MS * (target.rotations + 1))
    expect(engine.rotate).toHaveBeenCalledTimes(target.rotations + 1)
    expect(engine.move).not.toHaveBeenCalled()
  })

  it('drives a real engine to a hard drop', () => {
    const sequence = ['I', 'O', 'T', 'L', 'J', 'S', 'Z']
    let index = 0
    const engine = createEngine({ nextType: () => sequence[index++ % sequence.length] })
    const controller = createAiController(engine)

    let now = 0
    for (let i = 0; i < 50 && engine.score === 0; i++) {
      now += 60
      controller.step(now)
      engine.step(0)
    }
    expect(engine.score).toBeGreaterThan(0)
  })
})
