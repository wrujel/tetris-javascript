import { BOARD_WIDTH, COLORS } from './constants.js'

const shapes = {
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0]
  ],
  L: [
    [1, 1, 1],
    [0, 0, 1]
  ],
  J: [
    [1, 1, 1],
    [1, 0, 0]
  ],
  S: [
    [1, 1, 0],
    [0, 1, 1]
  ],
  Z: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  I: [
    [1, 1, 1, 1]
  ]
}

export const TYPES = ['I', 'O', 'T', 'L', 'J', 'S', 'Z']

// create a piece in its fixed spawn orientation
export function createPiece (type) {
  return {
    type,
    color: COLORS[type],
    position: {
      x: Math.floor(BOARD_WIDTH / 2 - 2),
      y: 0
    },
    shape: shapes[type].map(row => [...row])
  }
}

// 7-bag randomizer: every piece exactly once per bag
export function createBag () {
  const bag = [...TYPES]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = bag[i]
    bag[i] = bag[j]
    bag[j] = tmp
  }
  return bag
}

// bag feed: yields types, refilling a shuffled bag when empty
export function createBagFeed () {
  let bag = []
  return () => {
    if (bag.length === 0) bag = createBag()
    return bag.pop()
  }
}

// rotate piece
export function rotatePiece (piece, numberOfRotations = 1) {
  let newPiece = piece

  for (let i = 0; i < numberOfRotations; i++) {
    const rotate = []
    for (let y = 0; y < newPiece[0].length; y++) {
      const newRow = []
      for (let x = 0; x < newPiece.length; x++) {
        newRow.push(newPiece[x][y])
      }
      rotate.push(newRow.reverse())
    }
    newPiece = rotate
  }

  return newPiece
}
