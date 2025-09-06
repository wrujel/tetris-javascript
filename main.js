import { BOARD_WIDTH } from './utils/constants'
import { createRandomPiece, rotatePiece } from './utils/pieces'
import { createBoard, draw, checkCollision } from './utils/canvas'
import './style.css'

// score
let score = 0

// board
const board = createBoard()

// player piece
let piece = createRandomPiece()

// game loop
let dropCounter = 0
let lastTime = 0
let level = 1

function update (time = 0) {
  const deltaTime = time - lastTime
  lastTime = time

  dropCounter += deltaTime
  if (dropCounter > 1000 / level) {
    piece.position.y++

    if (checkCollision(board, piece)) {
      piece.position.y--
      solidfyPiece()
      removeRows()
    }

    dropCounter = 0
  }

  draw(board, piece, score, level)
  window.requestAnimationFrame(update)
}

// Listen keydowns
document.addEventListener('keydown', event => {
  piece = checkKeypressed(event)
})

// check key pressed
function checkKeypressed (event) {
  if (event.key === 'ArrowLeft') {
    piece.position.x--
    if (checkCollision(board, piece)) piece.position.x++
  }
  if (event.key === 'ArrowRight') {
    piece.position.x++
    if (checkCollision(board, piece)) piece.position.x--
  }
  if (event.key === 'ArrowDown') {
    piece.position.y++
    if (checkCollision(board, piece)) {
      piece.position.y--
      solidfyPiece()
      removeRows()
    }
  }
  if (event.key === 'ArrowUp') {
    piece.shape = rotatePiece(piece.shape)
    if (checkCollision(board, piece)) piece.shape = rotatePiece(piece.shape)
  }

  return piece
}

// solidfy piece and generate new one
export function solidfyPiece () {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value === 1) {
        board[piece.position.y + y][piece.position.x + x] = 1
      }
    })
  })

  piece = createRandomPiece()

  if (checkCollision(board, piece)) {
    gameOver()
  }
}

// remove full rows
export function removeRows () {
  const rowsToRemove = []

  board.forEach((row, y) => {
    if (row.every(value => value === 1)) {
      rowsToRemove.push(y)
    }
  })

  rowsToRemove.forEach(index => {
    board.splice(index, 1)
    board.unshift(new Array(BOARD_WIDTH).fill(0))
    score += 10
  })
  level = Math.floor(score / 100) + 1
}

// game over
function gameOver () {
  window.alert('Game Over')
  board.forEach(row => row.fill(0))
  score = 0
  level = 1
}

// Listen start game
const $section = document.querySelector('section')
const $controls = document.querySelector('.controls')
$section.addEventListener('click', () => {
  // start game loop
  update()
  // remove start overlay
  $section.remove()
  // show controls (they are hidden by default)
  if ($controls) $controls.hidden = false
})
