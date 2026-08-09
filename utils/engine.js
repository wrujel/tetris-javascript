import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  SCORE_TABLE,
  COMBO_POINTS,
  B2B_MULTIPLIER,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  CLEAR_DELAY,
  gravityMs
} from './constants.js'
import { createPiece, rotatePiece } from './pieces.js'

// wall-kick offsets tried in order after a rotation
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-3, 0], [3, 0]]

// create board
export function createBoard () {
  return Array.from({ length: BOARD_HEIGHT }, () => new Array(BOARD_WIDTH).fill(0))
}

// collision detection
export function checkCollision (board, piece) {
  return piece.shape.find((row, y) => {
    return row.find((value, x) => {
      return (
        value !== 0 &&
        board[piece.position.y + y]?.[piece.position.x + x] !== 0
      )
    })
  })
}

// ghost landing position
export function getGhostY (board, piece) {
  let ghostY = piece.position.y
  while (!checkCollision(board, { ...piece, position: { x: piece.position.x, y: ghostY + 1 } })) {
    ghostY++
  }
  return ghostY
}

// pure game core: no DOM, drives one board
export function createEngine ({ nextType, onEvent = () => {}, lockDelay = LOCK_DELAY, speedFactor = 1 }) {
  const board = createBoard()
  const queue = []
  let piece = null
  let heldType = null
  let canHold = true

  let score = 0
  let lines = 0
  let level = 1
  let combo = -1
  let b2b = false

  let dropCounter = 0
  let lockStart = null
  let lockResets = 0
  let clearing = null
  let gameOver = false

  function refillQueue () {
    while (queue.length < 4) {
      queue.push(createPiece(nextType()))
    }
  }

  function spawnNext () {
    refillQueue()
    piece = queue.shift()
    refillQueue()
    if (checkCollision(board, piece)) {
      gameOver = true
      onEvent({ type: 'gameover' })
      return
    }
    onEvent({ type: 'spawn' })
  }

  function isGrounded () {
    return Boolean(checkCollision(board, {
      ...piece,
      position: { x: piece.position.x, y: piece.position.y + 1 }
    }))
  }

  // moving/rotating on the ground buys more lock time (limited)
  function onSuccessfulAdjust () {
    if (isGrounded() && lockResets < MAX_LOCK_RESETS) {
      lockStart = performance.now()
      lockResets++
    }
  }

  function move (dx) {
    if (!piece || gameOver) return false
    piece.position.x += dx
    if (checkCollision(board, piece)) {
      piece.position.x -= dx
      return false
    }
    onSuccessfulAdjust()
    return true
  }

  function rotate () {
    if (!piece || gameOver) return
    const rotated = rotatePiece(piece.shape)
    for (const [dx, dy] of KICKS) {
      const candidate = {
        ...piece,
        shape: rotated,
        position: { x: piece.position.x + dx, y: piece.position.y + dy }
      }
      if (!checkCollision(board, candidate)) {
        piece.shape = rotated
        piece.position.x += dx
        piece.position.y += dy
        onSuccessfulAdjust()
        return
      }
    }
  }

  function softDrop () {
    if (!piece || gameOver) return
    piece.position.y++
    if (checkCollision(board, piece)) {
      piece.position.y--
    } else {
      score += 1
    }
  }

  function hardDrop () {
    if (!piece || gameOver) return
    const landingY = getGhostY(board, piece)
    score += (landingY - piece.position.y) * 2
    piece.position.y = landingY
    lockPiece()
  }

  function hold () {
    if (!piece || gameOver || !canHold) return
    const current = piece.type
    if (heldType === null) {
      heldType = current
      spawnNext()
    } else {
      piece = createPiece(heldType)
      heldType = current
      if (checkCollision(board, piece)) {
        gameOver = true
        onEvent({ type: 'gameover' })
        return
      }
    }
    canHold = false
    lockStart = null
    lockResets = 0
    onEvent({ type: 'hold' })
  }

  function lockPiece () {
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 1) {
          board[piece.position.y + y][piece.position.x + x] = piece.color
        }
      })
    })

    lockStart = null
    lockResets = 0
    canHold = true
    piece = null
    onEvent({ type: 'lock' })

    detectClears()
    if (!clearing) {
      spawnNext()
    }
  }

  function detectClears () {
    const rows = []
    board.forEach((row, y) => {
      if (row.every(value => value !== 0)) rows.push(y)
    })

    if (rows.length === 0) {
      combo = -1
      return
    }

    const count = rows.length
    combo++
    let points = SCORE_TABLE[count] * level
    let label = null
    if (count === 4) {
      if (b2b) {
        points = Math.floor(points * B2B_MULTIPLIER)
        label = 'B2B TETRIS!'
      } else {
        label = 'TETRIS!'
      }
      b2b = true
    } else {
      b2b = false
    }
    if (combo > 0) {
      points += COMBO_POINTS * combo * level
      if (!label) label = `COMBO x${combo + 1}`
    }

    score += points
    onEvent({ type: 'clear', rows, board, points, label })

    clearing = { rows, until: performance.now() + CLEAR_DELAY }
  }

  function finalizeClear () {
    clearing.rows.forEach(index => {
      board.splice(index, 1)
      board.unshift(new Array(BOARD_WIDTH).fill(0))
    })
    lines += clearing.rows.length
    level = Math.floor(lines / 10) + 1
    clearing = null
    spawnNext()
  }

  function step (dt) {
    if (gameOver) return
    const now = performance.now()

    if (clearing) {
      if (now >= clearing.until) finalizeClear()
      return
    }

    dropCounter += dt
    if (dropCounter > Math.max(gravityMs(level) / speedFactor, 40)) {
      if (!isGrounded()) piece.position.y++
      dropCounter = 0
    }

    if (!isGrounded()) {
      lockStart = null
    } else if (lockStart === null) {
      lockStart = now
    } else if (now - lockStart >= lockDelay) {
      lockPiece()
    }
  }

  // freeze timers (used when resuming from pause)
  function shiftTimers (ms) {
    if (lockStart !== null) lockStart += ms
    if (clearing) clearing.until += ms
  }

  refillQueue()
  spawnNext()

  return {
    get board () { return board },
    get piece () { return piece },
    get queue () { return queue },
    get heldType () { return heldType },
    get canHold () { return canHold },
    get score () { return score },
    get lines () { return lines },
    get level () { return level },
    get clearing () { return clearing },
    get gameOver () { return gameOver },
    move,
    rotate,
    softDrop,
    hardDrop,
    hold,
    step,
    shiftTimers,
    isGrounded
  }
}
