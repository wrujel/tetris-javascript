import { BOARD_WIDTH, BOARD_HEIGHT, AI_ACTION_MS } from './constants.js'
import { rotatePiece } from './pieces.js'
import { checkCollision } from './engine.js'

// Dellacherie evaluation weights (classic, near-perfect play)
const WEIGHTS = {
  landingHeight: -4.500158825082582,
  rowsEliminated: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  columnTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  cumulativeWells: -3.3855972247263626
}

// simulate a placement; returns the resulting board + landing row, or null
function simulate (board, piece, rotations, x) {
  let shape = piece.shape
  for (let i = 0; i < rotations; i++) shape = rotatePiece(shape)

  const candidate = { ...piece, shape, position: { x, y: piece.position.y } }
  if (checkCollision(board, candidate)) return null

  let y = piece.position.y
  while (!checkCollision(board, { ...candidate, position: { x, y: y + 1 } })) y++

  const sim = board.map(row => [...row])
  shape.forEach((row, sy) => {
    row.forEach((value, sx) => {
      if (value === 1) sim[y + sy][x + sx] = piece.color
    })
  })

  return { sim, landingY: y }
}

function evaluate (sim, landingY) {
  let rowsEliminated = 0
  let rowTransitions = 0
  let columnTransitions = 0
  let holes = 0
  let cumulativeWells = 0

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (sim[y].every(value => value !== 0)) rowsEliminated++

    let prev = 1 // edges count as filled
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const filled = sim[y][x] !== 0 ? 1 : 0
      if (filled !== prev) rowTransitions++
      prev = filled
    }
    if (prev === 0) rowTransitions++
  }

  for (let x = 0; x < BOARD_WIDTH; x++) {
    let prev = 1
    let seenFilled = false
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      const filled = sim[y][x] !== 0
      const filledBit = filled ? 1 : 0
      if (filledBit !== prev) columnTransitions++
      prev = filledBit

      if (filled) {
        seenFilled = true
        continue
      }
      if (seenFilled) holes++

      const leftWall = x === 0 || sim[y][x - 1] !== 0
      const rightWall = x === BOARD_WIDTH - 1 || sim[y][x + 1] !== 0
      if (leftWall && rightWall) {
        let depth = 0
        let wy = y
        while (wy < BOARD_HEIGHT && sim[wy][x] === 0) {
          depth++
          wy++
        }
        cumulativeWells += (depth * (depth + 1)) / 2
        y = wy - 1
      }
    }
  }

  return (
    WEIGHTS.landingHeight * (BOARD_HEIGHT - landingY) +
    WEIGHTS.rowsEliminated * rowsEliminated +
    WEIGHTS.rowTransitions * rowTransitions +
    WEIGHTS.columnTransitions * columnTransitions +
    WEIGHTS.holes * holes +
    WEIGHTS.cumulativeWells * cumulativeWells
  )
}

// best placement for the given piece: { rotations, x }
export function bestPlacement (board, piece) {
  let best = null

  for (let rotations = 0; rotations < 4; rotations++) {
    for (let x = -2; x < BOARD_WIDTH; x++) {
      const result = simulate(board, piece, rotations, x)
      if (!result) continue
      const score = evaluate(result.sim, result.landingY)
      if (!best || score > best.score) {
        best = { rotations, x, score }
      }
    }
  }

  return best
}

// drives an engine toward bestPlacement, one action per AI_ACTION_MS
export function createAiController (engine) {
  let target = null
  let currentPiece = null
  let rotationsApplied = 0
  let lastAction = 0

  function step (now) {
    if (engine.gameOver || engine.clearing) return
    const piece = engine.piece
    if (!piece) return

    if (piece !== currentPiece) {
      currentPiece = piece
      target = bestPlacement(engine.board, piece)
      rotationsApplied = 0
    }
    if (!target) return
    if (now - lastAction < AI_ACTION_MS) return
    lastAction = now

    if (rotationsApplied < target.rotations) {
      engine.rotate()
      rotationsApplied++
      return
    }
    if (piece.position.x < target.x) {
      engine.move(1)
      return
    }
    if (piece.position.x > target.x) {
      engine.move(-1)
      return
    }
    engine.hardDrop()
  }

  return { step }
}
