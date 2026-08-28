import { describe, it, expect } from 'vitest'
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  SCORE_TABLE,
  GAME_STATE,
  B2B_MULTIPLIER,
  gravityMs
} from '../utils/constants.js'

describe('gravityMs', () => {
  it('is 1000ms at level 1', () => {
    expect(gravityMs(1)).toBe(1000)
  })

  it('decreases as the level increases', () => {
    expect(gravityMs(2)).toBeLessThan(gravityMs(1))
    expect(gravityMs(3)).toBeLessThan(gravityMs(2))
  })

  it('is floored at 40ms for high levels', () => {
    expect(gravityMs(30)).toBe(40)
    expect(gravityMs(100)).toBe(40)
  })
})

describe('constants', () => {
  it('has the expected board dimensions', () => {
    expect(BOARD_WIDTH).toBe(14)
    expect(BOARD_HEIGHT).toBe(30)
  })

  it('has the expected score table', () => {
    expect(SCORE_TABLE).toEqual([0, 100, 300, 500, 800])
  })

  it('has the expected game states', () => {
    expect(GAME_STATE).toEqual({
      START: 'start',
      COUNTDOWN: 'countdown',
      PLAYING: 'playing',
      PAUSED: 'paused',
      GAME_OVER: 'gameover'
    })
  })

  it('has the expected back-to-back multiplier', () => {
    expect(B2B_MULTIPLIER).toBe(1.5)
  })
})
