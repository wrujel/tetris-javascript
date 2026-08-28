import { describe, it, expect } from 'vitest'
import { TYPES, createPiece, createBag, createBagFeed, rotatePiece } from '../utils/pieces.js'
import { COLORS, BOARD_WIDTH } from '../utils/constants.js'

describe('createPiece', () => {
  it.each(TYPES)('creates a %s piece with correct type, color and position', (type) => {
    const piece = createPiece(type)
    expect(piece.type).toBe(type)
    expect(piece.color).toBe(COLORS[type])
    expect(piece.position).toEqual({ x: 5, y: 0 })
    expect(piece.position.x).toBe(Math.floor(BOARD_WIDTH / 2 - 2))
  })

  it.each(TYPES)('returns a deep-copied shape for %s', (type) => {
    const first = createPiece(type)
    first.shape[0][0] = 99
    const second = createPiece(type)
    expect(second.shape[0][0]).not.toBe(99)
  })

  it('spawns the T piece in its fixed orientation', () => {
    expect(createPiece('T').shape).toEqual([
      [1, 1, 1],
      [0, 1, 0]
    ])
  })

  it('spawns the I piece as a 1x4 matrix', () => {
    expect(createPiece('I').shape).toEqual([[1, 1, 1, 1]])
  })
})

describe('createBag', () => {
  it('returns 7 entries with each type exactly once', () => {
    for (let i = 0; i < 20; i++) {
      const bag = createBag()
      expect(bag).toHaveLength(7)
      expect([...bag].sort()).toEqual([...TYPES].sort())
    }
  })
})

describe('createBagFeed', () => {
  it('yields each type once per bag and refills when empty', () => {
    const feed = createBagFeed()
    const draws = Array.from({ length: 14 }, () => feed())
    expect([...draws.slice(0, 7)].sort()).toEqual([...TYPES].sort())
    expect([...draws.slice(7, 14)].sort()).toEqual([...TYPES].sort())
  })
})

describe('rotatePiece', () => {
  const tShape = [
    [1, 1, 1],
    [0, 1, 0]
  ]

  it('rotates a T piece 90° clockwise once', () => {
    expect(rotatePiece(tShape.map(row => [...row]))).toEqual([
      [0, 1],
      [1, 1],
      [0, 1]
    ])
  })

  it('returns the original matrix after 4 rotations', () => {
    let shape = tShape.map(row => [...row])
    for (let i = 0; i < 4; i++) {
      shape = rotatePiece(shape)
    }
    expect(shape).toEqual(tShape)
  })

  it('rotatePiece(shape, 2) equals rotating twice', () => {
    const twice = rotatePiece(rotatePiece(tShape.map(row => [...row])))
    expect(rotatePiece(tShape.map(row => [...row]), 2)).toEqual(twice)
    expect(twice).toEqual([
      [0, 1, 0],
      [1, 1, 1]
    ])
  })

  it('rotates a non-square 1x4 I piece into 4x1', () => {
    expect(rotatePiece([[1, 1, 1, 1]])).toEqual([
      [1],
      [1],
      [1],
      [1]
    ])
  })
})
