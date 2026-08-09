export const BLOCK_SIZE = 20
export const BOARD_WIDTH = 14
export const BOARD_HEIGHT = 30

// neon piece palette
export const COLORS = {
  I: '#00e5ff',
  O: '#ffd60a',
  T: '#c77dff',
  L: '#ff9e00',
  S: '#06d6a0',
  J: '#4f7cff',
  Z: '#ff4d6d'
}

// effects tuning
export const PARTICLES_PER_CELL = 6
export const PARTICLE_GRAVITY = 0.0001
export const PARTICLE_LIFE = 800
export const SHAKE_BASE = 4
export const SLOWMO_SCALE = 0.3
export const SLOWMO_DURATION = 500

export const GAME_STATE = {
  START: 'start',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover'
}

// scoring
export const SCORE_TABLE = [0, 100, 300, 500, 800]
export const COMBO_POINTS = 50
export const B2B_MULTIPLIER = 1.5

// gameplay timings (ms)
export const LOCK_DELAY = 500
export const MAX_LOCK_RESETS = 15
export const DAS = 150
export const ARR = 40
export const CLEAR_DELAY = 160

// gravity per level
export const gravityMs = level => Math.max(1000 * Math.pow(0.8, level - 1), 40)

// versus / doom mode
export const BASE_FACTOR = 5
export const TURBO_FACTOR = 10
export const TURBO_LOCK_DELAY = 300
export const VS_DURATION = 180000
export const AI_ACTION_MS = 50

// shown randomly on the versus countdown
export const DOOM_MESSAGES = [
  'Prepare to suffer',
  'Abandon all hope',
  'You will lose',
  'No mercy here',
  'Embrace the chaos',
  'Try to keep up',
  'Fear the machine',
  'Good luck, human',
  'This ends badly',
  'Your doom begins'
]
