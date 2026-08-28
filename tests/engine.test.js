import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBoard, checkCollision, getGhostY, createEngine } from '../utils/engine.js'
import { createPiece } from '../utils/pieces.js'
import { BOARD_WIDTH, BOARD_HEIGHT, LOCK_DELAY, CLEAR_DELAY } from '../utils/constants.js'

let now = 0

const makeFeed = types => {
  let i = 0
  return () => types[i++ % types.length]
}

const makeEngine = (types, opts = {}) => createEngine({ nextType: makeFeed(types), ...opts })

const fillRow = (board, y, except = []) => {
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (!except.includes(x)) board[y][x] = '#888888'
  }
}

// hard-drop the current I piece horizontally into row 29, completing it
const dropSingleLineClear = engine => {
  fillRow(engine.board, BOARD_HEIGHT - 1, [0, 1, 2, 3])
  for (let i = 0; i < 5; i++) engine.move(-1)
  engine.hardDrop()
}

// hard-drop the current I piece vertically into column 13, completing rows 26-29
const dropTetris = engine => {
  for (const y of [26, 27, 28, 29]) fillRow(engine.board, y, [13])
  engine.rotate()
  for (let i = 0; i < 8; i++) engine.move(1)
  engine.hardDrop()
}

// advance time to the end of the clear delay and let step() finalize it
const finalizeClearNow = engine => {
  now = engine.clearing.until
  engine.step(0)
}

const eventsOf = (events, type) => events.filter(event => event.type === type)

// fill the spawn area, then lock a piece so the next spawn collides
const makeGameOver = () => {
  const engine = makeEngine(['O'])
  for (let y = 0; y <= 1; y++) {
    for (let x = 5; x <= 8; x++) engine.board[y][x] = '#888888'
  }
  engine.hardDrop()
  return engine
}

beforeEach(() => {
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createBoard', () => {
  it('creates a 30x14 board of zeros with independent rows', () => {
    const board = createBoard()
    expect(board).toHaveLength(BOARD_HEIGHT)
    for (const row of board) {
      expect(row).toHaveLength(BOARD_WIDTH)
      expect(row.every(value => value === 0)).toBe(true)
    }
    expect(board[0]).not.toBe(board[1])
  })
})

describe('checkCollision', () => {
  it('returns falsy for a piece in empty space', () => {
    // the T shape has holes, so its value === 0 cells are skipped
    expect(checkCollision(createBoard(), createPiece('T'))).toBeFalsy()
  })

  it('detects the floor below the board', () => {
    const piece = createPiece('I')
    piece.position.y = BOARD_HEIGHT
    expect(checkCollision(createBoard(), piece)).toBeTruthy()
  })

  it('detects the side walls', () => {
    const left = createPiece('I')
    left.position.x = -1
    expect(checkCollision(createBoard(), left)).toBeTruthy()
    const right = createPiece('I')
    right.position.x = BOARD_WIDTH - 3
    expect(checkCollision(createBoard(), right)).toBeTruthy()
  })

  it('detects settled blocks on the board', () => {
    const board = createBoard()
    board[1][6] = '#888888'
    expect(checkCollision(board, createPiece('T'))).toBeTruthy()
  })
})

describe('getGhostY', () => {
  it('returns the bottom row on an empty board', () => {
    expect(getGhostY(createBoard(), createPiece('I'))).toBe(BOARD_HEIGHT - 1)
  })

  it('stops above a settled stack', () => {
    const board = createBoard()
    fillRow(board, BOARD_HEIGHT - 1)
    expect(getGhostY(board, createPiece('I'))).toBe(BOARD_HEIGHT - 2)
  })
})

describe('createEngine', () => {
  it('spawns the first piece, keeps 4 queued and starts with clean state', () => {
    const engine = makeEngine(['T', 'I'])
    expect(engine.piece.type).toBe('T')
    expect(engine.queue).toHaveLength(4)
    expect(engine.queue[0].type).toBe('I')
    expect(engine.score).toBe(0)
    expect(engine.lines).toBe(0)
    expect(engine.level).toBe(1)
    expect(engine.heldType).toBeNull()
    expect(engine.canHold).toBe(true)
    expect(engine.clearing).toBeNull()
    expect(engine.gameOver).toBe(false)
  })

  it('emits a spawn event for the first piece', () => {
    const events = []
    makeEngine(['T'], { onEvent: event => events.push(event) })
    expect(eventsOf(events, 'spawn')).toHaveLength(1)
  })
})

describe('move', () => {
  it('moves the piece sideways and returns true', () => {
    const engine = makeEngine(['I'])
    expect(engine.move(1)).toBe(true)
    expect(engine.piece.position.x).toBe(6)
    expect(engine.move(-1)).toBe(true)
    expect(engine.piece.position.x).toBe(5)
  })

  it('returns false and stays put against the walls', () => {
    const engine = makeEngine(['I'])
    for (let i = 0; i < 10; i++) engine.move(-1)
    expect(engine.piece.position.x).toBe(0)
    expect(engine.move(-1)).toBe(false)
    expect(engine.piece.position.x).toBe(0)
    for (let i = 0; i < 20; i++) engine.move(1)
    expect(engine.piece.position.x).toBe(BOARD_WIDTH - 4)
    expect(engine.move(1)).toBe(false)
    expect(engine.piece.position.x).toBe(BOARD_WIDTH - 4)
  })

  it('returns false with no piece or after game over', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    expect(engine.piece).toBeNull()
    expect(engine.move(1)).toBe(false)

    const dead = makeGameOver()
    expect(dead.move(1)).toBe(false)
    expect(dead.piece.position.x).toBe(5)
  })

  it('resets the lock timer when adjusted while grounded', () => {
    const events = []
    const engine = makeEngine(['O'], { onEvent: event => events.push(event) })
    engine.piece.position.y = 28
    engine.step(0) // lockStart = 0
    now = 100
    expect(engine.move(1)).toBe(true) // grounded move: lockStart = 100
    now = 550
    engine.step(0) // 550 - 100 < 500: no lock yet
    expect(eventsOf(events, 'lock')).toHaveLength(0)
    now = 600
    engine.step(0) // 600 - 100 >= 500: locks
    expect(eventsOf(events, 'lock')).toHaveLength(1)
    expect(engine.board[28][6]).not.toBe(0)
  })

  it('stops resetting the lock timer after MAX_LOCK_RESETS moves', () => {
    const engine = makeEngine(['I'])
    engine.piece.position.y = 29
    engine.step(0) // lockStart = 0
    for (let i = 1; i <= 15; i++) {
      now = i
      expect(engine.move(i % 2 === 1 ? 1 : -1)).toBe(true)
    }
    // lockResets is now at the cap, lockStart = 15
    now = 100
    expect(engine.move(1)).toBe(true) // succeeds but must not reset the timer
    now = 514
    engine.step(0) // 514 - 15 < 500
    expect(engine.board[29].every(value => value === 0)).toBe(true)
    now = 515
    engine.step(0) // 515 - 15 >= 500: locks
    expect(engine.board[29][7]).not.toBe(0)
  })
})

describe('rotate', () => {
  it('rotates in place on an empty board', () => {
    const engine = makeEngine(['I'])
    engine.rotate()
    expect(engine.piece.shape).toEqual([[1], [1], [1], [1]])
    expect(engine.piece.position).toEqual({ x: 5, y: 0 })
  })

  it('wall-kicks away from the right wall', () => {
    const engine = makeEngine(['I'])
    engine.rotate() // vertical
    for (let i = 0; i < 8; i++) engine.move(1) // against the wall at x = 13
    expect(engine.piece.position.x).toBe(13)
    engine.rotate()
    expect(engine.piece.shape).toEqual([[1, 1, 1, 1]])
    expect(engine.piece.position.x).toBe(10) // kicked 3 cells left
  })

  it('leaves the piece unchanged when every kick collides', () => {
    const engine = makeEngine(['I'])
    fillRow(engine.board, 25)
    for (const y of [26, 27, 28, 29]) fillRow(engine.board, y, [5])
    engine.rotate() // vertical, fits the one-column shaft
    engine.piece.position.y = 26
    engine.rotate()
    expect(engine.piece.shape).toEqual([[1], [1], [1], [1]])
    expect(engine.piece.position).toEqual({ x: 5, y: 26 })
  })

  it('is a no-op with no piece or after game over', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    expect(engine.piece).toBeNull()
    engine.rotate() // must not throw

    const dead = makeGameOver()
    const shapeBefore = dead.piece.shape
    dead.rotate()
    expect(dead.piece.shape).toBe(shapeBefore)
  })
})

describe('softDrop', () => {
  it('scores 1 point per cell and stops at the floor', () => {
    const engine = makeEngine(['I'])
    for (let i = 0; i < 5; i++) engine.softDrop()
    expect(engine.piece.position.y).toBe(5)
    expect(engine.score).toBe(5)
    engine.piece.position.y = 29
    engine.softDrop()
    expect(engine.piece.position.y).toBe(29)
    expect(engine.score).toBe(5) // the blocked step scores nothing
  })

  it('is a no-op with no piece or after game over', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    const score = engine.score
    engine.softDrop()
    expect(engine.score).toBe(score)

    const dead = makeGameOver()
    dead.softDrop()
    expect(dead.score).toBe(0)
  })
})

describe('hardDrop', () => {
  it('scores twice the distance, locks the piece and re-enables hold', () => {
    const events = []
    const engine = makeEngine(['I'], { onEvent: event => events.push(event) })
    engine.hold() // disable hold so the lock re-enables it
    expect(engine.canHold).toBe(false)
    engine.hardDrop()
    expect(engine.score).toBe(58) // 29 cells * 2
    for (let x = 5; x <= 8; x++) expect(engine.board[29][x]).not.toBe(0)
    expect(engine.canHold).toBe(true)
    expect(eventsOf(events, 'lock')).toHaveLength(1)
    expect(engine.piece).not.toBeNull() // next piece spawned
  })

  it('is a no-op with no piece or after game over', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    const score = engine.score
    engine.hardDrop()
    expect(engine.score).toBe(score)

    const dead = makeGameOver()
    dead.hardDrop()
    expect(dead.score).toBe(0)
  })
})

describe('hold', () => {
  it('stores the current type and spawns the next piece on first hold', () => {
    const events = []
    const engine = makeEngine(['T', 'I', 'O'], { onEvent: event => events.push(event) })
    engine.hold()
    expect(engine.heldType).toBe('T')
    expect(engine.piece.type).toBe('I')
    expect(engine.canHold).toBe(false)
    expect(eventsOf(events, 'hold')).toHaveLength(1)
  })

  it('ignores a second hold before locking', () => {
    const events = []
    const engine = makeEngine(['T', 'I', 'O'], { onEvent: event => events.push(event) })
    engine.hold()
    const piece = engine.piece
    engine.hold()
    expect(engine.piece).toBe(piece)
    expect(engine.heldType).toBe('T')
    expect(eventsOf(events, 'hold')).toHaveLength(1)
  })

  it('swaps current and held pieces after a lock', () => {
    const engine = makeEngine(['T', 'I', 'O'])
    engine.hold() // held T, current I
    engine.hardDrop() // locks I, spawns O, hold re-enabled
    expect(engine.piece.type).toBe('O')
    engine.hold()
    expect(engine.piece.type).toBe('T')
    expect(engine.heldType).toBe('O')
    expect(engine.canHold).toBe(false)
  })

  it('ends the game when the swapped-in piece collides at spawn', () => {
    const events = []
    const engine = makeEngine(['T', 'I', 'O'], { onEvent: event => events.push(event) })
    engine.hold() // held T
    engine.hardDrop() // locks I, spawns O
    for (const x of [5, 6, 7]) engine.board[0][x] = '#888888'
    engine.hold() // T spawns into the blocked area
    expect(engine.gameOver).toBe(true)
    expect(engine.heldType).toBe('O')
    expect(eventsOf(events, 'gameover')).toHaveLength(1)
  })

  it('is a no-op with no piece or after game over', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    engine.hold() // no piece during the clear
    expect(engine.heldType).toBeNull()

    const dead = makeGameOver()
    dead.hold()
    expect(dead.heldType).toBeNull()
  })
})

describe('line clears', () => {
  it('scores a single line with no label', () => {
    const events = []
    const engine = makeEngine(['I'], { onEvent: event => events.push(event) })
    dropSingleLineClear(engine)
    const clears = eventsOf(events, 'clear')
    expect(clears).toHaveLength(1)
    expect(clears[0].rows).toEqual([29])
    expect(clears[0].points).toBe(100)
    expect(clears[0].label).toBeNull()
    expect(engine.score).toBe(158) // 58 drop + 100 clear
    expect(engine.clearing).not.toBeNull()
    expect(engine.clearing.until).toBe(CLEAR_DELAY)
    expect(engine.piece).toBeNull()
  })

  it('scores a tetris, then a back-to-back tetris', () => {
    const events = []
    const engine = makeEngine(['I'], { onEvent: event => events.push(event) })
    dropTetris(engine)
    let clears = eventsOf(events, 'clear')
    expect(clears[0].rows).toEqual([26, 27, 28, 29])
    expect(clears[0].points).toBe(800)
    expect(clears[0].label).toBe('TETRIS!')
    expect(engine.score).toBe(852) // 52 drop + 800

    finalizeClearNow(engine)
    dropTetris(engine)
    clears = eventsOf(events, 'clear')
    expect(clears).toHaveLength(2)
    expect(clears[1].points).toBe(1250) // floor(800 * 1.5) + 50 combo
    expect(clears[1].label).toBe('B2B TETRIS!')
  })

  it('scores a combo on consecutive single clears', () => {
    const events = []
    const engine = makeEngine(['I'], { onEvent: event => events.push(event) })
    dropSingleLineClear(engine)
    finalizeClearNow(engine)
    dropSingleLineClear(engine)
    const clears = eventsOf(events, 'clear')
    expect(clears).toHaveLength(2)
    expect(clears[1].points).toBe(150) // 100 + 50 * combo * level
    expect(clears[1].label).toBe('COMBO x2')
  })

  it('resets the combo when a lock clears nothing', () => {
    const events = []
    const engine = makeEngine(['I', 'T'], { onEvent: event => events.push(event) })
    dropSingleLineClear(engine) // combo 0
    finalizeClearNow(engine)
    engine.hardDrop() // T locks without clearing: combo back to -1
    expect(eventsOf(events, 'clear')).toHaveLength(1)
    dropSingleLineClear(engine)
    const clears = eventsOf(events, 'clear')
    expect(clears).toHaveLength(2)
    expect(clears[1].points).toBe(100)
    expect(clears[1].label).toBeNull()
  })

  it('reaches level 2 after 10 cleared lines', () => {
    const engine = makeEngine(['I'])
    for (let i = 0; i < 10; i++) {
      dropSingleLineClear(engine)
      finalizeClearNow(engine)
    }
    expect(engine.lines).toBe(10)
    expect(engine.level).toBe(2)
  })
})

describe('clearing flow', () => {
  it('waits until the clear delay passes, then finalizes', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine)
    const until = engine.clearing.until

    now = until - 1
    engine.step(0)
    expect(engine.clearing).not.toBeNull()
    expect(engine.piece).toBeNull()
    expect(engine.board[29].every(value => value !== 0)).toBe(true)

    now = until
    engine.step(0)
    expect(engine.clearing).toBeNull()
    expect(engine.lines).toBe(1)
    expect(engine.level).toBe(1)
    expect(engine.board.every(row => row.every(value => value === 0))).toBe(true)
    expect(engine.piece).not.toBeNull()
    expect(engine.piece.type).toBe('I')
  })
})

describe('game over', () => {
  it('ends the game when a new piece collides at spawn', () => {
    const events = []
    const engine = makeEngine(['O'], { onEvent: event => events.push(event) })
    for (let y = 0; y <= 1; y++) {
      for (let x = 5; x <= 8; x++) engine.board[y][x] = '#888888'
    }
    engine.hardDrop()
    expect(engine.gameOver).toBe(true)
    expect(eventsOf(events, 'gameover')).toHaveLength(1)
  })

  it('makes every action a no-op after game over', () => {
    const engine = makeGameOver()
    expect(engine.gameOver).toBe(true)
    const { position, shape } = engine.piece

    expect(engine.move(1)).toBe(false)
    expect(engine.piece.position).toBe(position)
    engine.rotate()
    expect(engine.piece.shape).toBe(shape)
    engine.softDrop()
    engine.hardDrop()
    expect(engine.score).toBe(0)
    engine.hold()
    expect(engine.heldType).toBeNull()
    engine.step(1000)
    expect(engine.piece.position).toBe(position)
  })
})

describe('step', () => {
  it('drops the piece when the gravity interval passes', () => {
    const engine = makeEngine(['I'])
    engine.step(1000) // exactly 1000 is not enough
    expect(engine.piece.position.y).toBe(0)
    engine.step(1) // 1001 > 1000: falls, counter resets
    expect(engine.piece.position.y).toBe(1)
    engine.step(1000)
    expect(engine.piece.position.y).toBe(1)
    engine.step(1)
    expect(engine.piece.position.y).toBe(2)
  })

  it('clamps the interval to 40ms with a high speed factor', () => {
    const engine = makeEngine(['I'], { speedFactor: 100 })
    engine.step(40) // 40 is not > 40
    expect(engine.piece.position.y).toBe(0)
    engine.step(1)
    expect(engine.piece.position.y).toBe(1)
  })

  it('does not move a grounded piece down past the interval', () => {
    const engine = makeEngine(['O'])
    engine.piece.position.y = 28
    engine.step(1001)
    expect(engine.piece.position.y).toBe(28)
  })

  it('locks a grounded piece after the lock delay', () => {
    const events = []
    const engine = makeEngine(['O'], { onEvent: event => events.push(event) })
    engine.piece.position.y = 28
    engine.step(0) // first grounded step arms the timer
    expect(eventsOf(events, 'lock')).toHaveLength(0)
    now = LOCK_DELAY - 1
    engine.step(0)
    expect(eventsOf(events, 'lock')).toHaveLength(0)
    now = LOCK_DELAY
    engine.step(0)
    expect(eventsOf(events, 'lock')).toHaveLength(1)
    expect(engine.board[28][5]).not.toBe(0)
    expect(engine.board[29][6]).not.toBe(0)
    expect(engine.piece).not.toBeNull() // next piece spawned
  })

  it('disarms the lock timer when the piece leaves the ground', () => {
    const events = []
    const engine = makeEngine(['O'], { onEvent: event => events.push(event) })
    engine.piece.position.y = 28
    engine.step(0) // lockStart = 0
    engine.piece.position.y = 0
    now = 100
    engine.step(0) // off the ground: timer cleared
    engine.piece.position.y = 28
    now = 200
    engine.step(0) // grounded again: lockStart = 200
    now = 600
    engine.step(0) // 600 - 200 < 500: still unlocked (would be locked at 0)
    expect(eventsOf(events, 'lock')).toHaveLength(0)
    now = 700
    engine.step(0)
    expect(eventsOf(events, 'lock')).toHaveLength(1)
  })

  it('is a no-op after game over', () => {
    const dead = makeGameOver()
    const y = dead.piece.position.y
    dead.step(1000)
    expect(dead.piece.position.y).toBe(y)
  })
})

describe('shiftTimers', () => {
  it('delays the lock timer of a grounded piece', () => {
    const engine = makeEngine(['O'], { lockDelay: 300 })
    engine.piece.position.y = 28
    engine.step(0) // lockStart = 0
    engine.shiftTimers(1000) // lockStart = 1000
    now = 400
    engine.step(0) // would have locked without the shift
    expect(engine.board[28].every(value => value === 0)).toBe(true)
    now = 1300
    engine.step(0) // 1300 - 1000 >= 300: locks
    expect(engine.board[28][5]).not.toBe(0)
  })

  it('delays a pending line clear', () => {
    const engine = makeEngine(['I'])
    dropSingleLineClear(engine) // until = CLEAR_DELAY
    engine.shiftTimers(1000)
    now = CLEAR_DELAY
    engine.step(0)
    expect(engine.clearing).not.toBeNull()
    expect(engine.board[29].every(value => value !== 0)).toBe(true)
    now = CLEAR_DELAY + 1000
    engine.step(0)
    expect(engine.clearing).toBeNull()
    expect(engine.board[29].every(value => value === 0)).toBe(true)
  })

  it('does nothing when no timers are running', () => {
    const engine = makeEngine(['I'])
    engine.shiftTimers(1000)
    engine.step(1001)
    expect(engine.piece.position.y).toBe(1) // gravity unaffected
  })
})

describe('isGrounded', () => {
  it('is false at spawn and true at the bottom', () => {
    const engine = makeEngine(['O'])
    expect(engine.isGrounded()).toBe(false)
    engine.piece.position.y = 28
    expect(engine.isGrounded()).toBe(true)
  })
})
