import { BOARD_HEIGHT, BOARD_WIDTH, BLOCK_SIZE } from './constants.js'
import { getGhostY } from './engine.js'

// pre-rendered neon block sprites, keyed by color (shared by all boards)
const sprites = new Map()
const ghostSprites = new Map()

function createBlockSprite (color) {
  const sprite = document.createElement('canvas')
  sprite.width = BLOCK_SIZE
  sprite.height = BLOCK_SIZE
  const spriteContext = sprite.getContext('2d')

  // glow pass
  spriteContext.shadowColor = color
  spriteContext.shadowBlur = 6
  spriteContext.fillStyle = color
  spriteContext.fillRect(1, 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2)

  // bevel: top highlight, bottom shade
  spriteContext.shadowBlur = 0
  const bevel = spriteContext.createLinearGradient(0, 0, 0, BLOCK_SIZE)
  bevel.addColorStop(0, 'rgba(255, 255, 255, 0.5)')
  bevel.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)')
  bevel.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
  spriteContext.fillStyle = bevel
  spriteContext.fillRect(1, 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2)

  // inner core
  spriteContext.fillStyle = 'rgba(255, 255, 255, 0.15)'
  spriteContext.fillRect(4, 4, BLOCK_SIZE - 8, BLOCK_SIZE - 8)

  return sprite
}

function createGhostSprite (color) {
  const sprite = document.createElement('canvas')
  sprite.width = BLOCK_SIZE
  sprite.height = BLOCK_SIZE
  const spriteContext = sprite.getContext('2d')

  spriteContext.globalAlpha = 0.4
  spriteContext.strokeStyle = color
  spriteContext.lineWidth = 1.5
  spriteContext.strokeRect(1.5, 1.5, BLOCK_SIZE - 3, BLOCK_SIZE - 3)

  return sprite
}

function getSprite (color) {
  if (!sprites.has(color)) sprites.set(color, createBlockSprite(color))
  return sprites.get(color)
}

function getGhostSprite (color) {
  if (!ghostSprites.has(color)) ghostSprites.set(color, createGhostSprite(color))
  return ghostSprites.get(color)
}

function drawShape (target, shape, offsetX, offsetY, sprite) {
  shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value === 1) {
        target.drawImage(sprite, offsetX + x, offsetY + y, 1, 1)
      }
    })
  })
}

// board renderer for one canvas (blockSize scales the whole board)
export function createBoardRenderer (canvas, blockSize = BLOCK_SIZE) {
  const context = canvas.getContext('2d')
  canvas.width = blockSize * BOARD_WIDTH
  canvas.height = blockSize * BOARD_HEIGHT
  context.scale(blockSize, blockSize)

  function draw ({ board, piece, clearingRows }) {
    context.fillStyle = '#05070f'
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)

    // faint grid
    context.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    context.lineWidth = 0.04
    context.beginPath()
    for (let x = 1; x < BOARD_WIDTH; x++) {
      context.moveTo(x, 0)
      context.lineTo(x, BOARD_HEIGHT)
    }
    for (let y = 1; y < BOARD_HEIGHT; y++) {
      context.moveTo(0, y)
      context.lineTo(BOARD_WIDTH, y)
    }
    context.stroke()

    // settled blocks (rows being cleared flash white)
    const flash = 0.25 + 0.25 * Math.sin(performance.now() / 40)
    board.forEach((row, y) => {
      const isClearing = clearingRows !== null && clearingRows.includes(y)
      row.forEach((value, x) => {
        if (value !== 0) {
          context.drawImage(getSprite(value), x, y, 1, 1)
          if (isClearing) {
            context.fillStyle = `rgba(255, 255, 255, ${flash})`
            context.fillRect(x, y, 1, 1)
          }
        }
      })
    })

    if (piece) {
      // ghost landing indicator
      drawShape(context, piece.shape, piece.position.x, getGhostY(board, piece), getGhostSprite(piece.color))
      // active piece
      drawShape(context, piece.shape, piece.position.x, piece.position.y, getSprite(piece.color))
    }
  }

  return { draw, context }
}

// queue preview: 3 slots stacked, 4x4 blocks each (solo + versus panels)
const nextContexts = ['#next', '#next-vs'].map(selector => {
  const canvas = document.querySelector(selector)
  const context = canvas.getContext('2d')
  canvas.width = BLOCK_SIZE * 4
  canvas.height = BLOCK_SIZE * 12
  context.scale(BLOCK_SIZE, BLOCK_SIZE)
  return context
})

export function drawQueue (pieces) {
  nextContexts.forEach(context => {
    context.clearRect(0, 0, 4, 12)
    pieces.slice(0, 3).forEach((piece, i) => {
      const offsetX = (4 - piece.shape[0].length) / 2
      const offsetY = i * 4 + (4 - piece.shape.length) / 2
      drawShape(context, piece.shape, offsetX, offsetY, getSprite(piece.color))
    })
  })
}

// hold preview, dimmed while hold is locked out (solo panel; hold is off in doom)
const holdContexts = ['#hold'].map(selector => {
  const canvas = document.querySelector(selector)
  const context = canvas.getContext('2d')
  canvas.width = BLOCK_SIZE * 4
  canvas.height = BLOCK_SIZE * 4
  context.scale(BLOCK_SIZE, BLOCK_SIZE)
  return context
})

export function drawHold (piece, canHold) {
  holdContexts.forEach(context => {
    context.clearRect(0, 0, 4, 4)
    if (!piece) return
    context.save()
    context.globalAlpha = canHold ? 1 : 0.3
    const offsetX = (4 - piece.shape[0].length) / 2
    const offsetY = (4 - piece.shape.length) / 2
    drawShape(context, piece.shape, offsetX, offsetY, getSprite(piece.color))
    context.restore()
  })
}
