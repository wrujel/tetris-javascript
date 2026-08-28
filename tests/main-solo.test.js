import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function makeFakeCtx () {
  return new Proxy({}, {
    get (t, p) {
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      if (!(p in t)) t[p] = vi.fn()
      return t[p]
    },
    set (t, p, v) {
      t[p] = v
      return true
    }
  })
}

let rafCb = null
let now = 0

async function boot () {
  vi.resetModules()
  rafCb = null
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1]
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeFakeCtx())
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  window.requestAnimationFrame = cb => {
    rafCb = cb
    return 1
  }
  window.cancelAnimationFrame = () => {
    rafCb = null
  }
  // game-over screen delay runs instantly
  vi.spyOn(window, 'setTimeout').mockImplementation(cb => {
    cb()
    return 0
  })
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  await import('../main.js')
}

const $ = selector => document.querySelector(selector)

function press (key, options = {}) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, cancelable: true, ...options }))
}

function release (key) {
  document.dispatchEvent(new window.KeyboardEvent('keyup', { key }))
}

// advance the mocked clock and run one game-loop frame if one is registered
function frame (advance = 16) {
  now += advance
  const cb = rafCb
  rafCb = null
  if (cb) cb(now)
}

function score () {
  return Number($('#score').innerText)
}

// hard-drop pieces straight down at spawn x until the stack tops out
function topOut () {
  for (let i = 0; i < 90 && $('#gameover-screen').hidden; i++) {
    press(' ')
    if (i % 4 === 0) frame(50)
  }
}

beforeEach(async () => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  await boot()
})

afterEach(() => {
  // park the current app on the menu so its document listeners stay inert
  $('#menu-solo')?.click()
  rafCb = null
})

describe('boot and start screen', () => {
  it('boots to the start screen with a zeroed HUD', () => {
    expect($('#start-screen').hidden).toBe(false)
    expect($('#pause-screen').hidden).toBe(true)
    expect($('#gameover-screen').hidden).toBe(true)
    expect(Number($('#score').innerText)).toBe(0)
    expect(Number($('#level').innerText)).toBe(1)
    expect(Number($('#lines').innerText)).toBe(0)
    expect(Number($('#best').innerText)).toBe(0)
  })

  it('ignores keyboard input before a game starts', () => {
    press('ArrowLeft')
    press('ArrowRight')
    press('ArrowDown')
    press('ArrowUp')
    press(' ')
    press('c')
    press('C')
    press('Shift')
    press('Escape')
    press('p')
    release('ArrowLeft')
    release('ArrowRight')
    expect($('#start-screen').hidden).toBe(false)
    expect($('#pause-screen').hidden).toBe(true)
    expect(score()).toBe(0)
  })
})

describe('solo gameplay input', () => {
  it('starts a solo game via #card-solo and scores on hard drop', () => {
    $('#card-solo').click()
    expect($('#start-screen').hidden).toBe(true)
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
    // clicking the card again restarts mid-game (cancels the running loop)
    $('#card-solo').click()
    frame()
    expect(score()).toBe(0)
    expect($('#start-screen').hidden).toBe(true)
  })

  it('handles movement keys including both-directions-held dir switches', () => {
    $('#card-solo').click()
    press('ArrowLeft')
    press('ArrowLeft', { repeat: true }) // repeat sets the flag, skips dir/move
    press('ArrowRight') // now both held, dir = 1
    release('ArrowRight') // left still held → dir back to -1
    release('ArrowLeft') // nothing held → dir 0
    press('ArrowRight')
    press('ArrowLeft', { repeat: true }) // left flag set, dir stays 1
    release('ArrowRight') // left held → dir -1
    release('ArrowLeft') // dir 0
    press('ArrowRight')
    release('ArrowLeft') // not held, dir unchanged
    release('ArrowRight')
    press('ArrowLeft')
    release('ArrowRight') // not held, dir unchanged
    release('ArrowLeft')
    press('a') // unhandled key passes through harmlessly
    press('Enter')
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })

  it('ignores auto-repeat for rotate, hard drop and hold', () => {
    $('#card-solo').click()
    press('ArrowUp', { repeat: true })
    press(' ', { repeat: true })
    press('c', { repeat: true })
    frame()
    expect(score()).toBe(0) // the repeated hard drop was ignored
    press('ArrowUp')
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })

  it('rotates, soft drops, hard drops and holds', () => {
    $('#card-solo').click()
    press('ArrowDown') // soft drop scores +1 per cell
    frame()
    const afterSoft = score()
    expect(afterSoft).toBeGreaterThan(0)
    press('ArrowUp') // rotate
    press('c') // hold: stores the current piece
    press('C') // ignored: hold is locked until the next lock
    press('Shift') // ignored: same
    press(' ') // hard drop locks and re-enables hold
    frame()
    const afterHard = score()
    expect(afterHard).toBeGreaterThan(afterSoft)
    press('c') // hold works again after the lock (swap branch)
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(afterHard)
  })

  it('auto-shifts via DAS/ARR while a direction is held', () => {
    $('#card-solo').click()
    frame(50) // no direction held → early return
    press('ArrowLeft')
    frame(10) // inside DAS window → early return
    frame(200) // DAS elapsed → auto-shift fires
    frame(10) // inside ARR window since last shift → skipped
    frame(50) // ARR elapsed → auto-shift fires again
    press('ArrowRight')
    frame(200)
    release('ArrowLeft')
    release('ArrowRight')
    frame(50)
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })
})

describe('pause and resume', () => {
  it('pauses and resumes with Escape, ignoring input while paused', () => {
    $('#card-solo').click()
    press('Escape')
    expect($('#pause-screen').hidden).toBe(false)
    expect(rafCb).toBeNull() // game loop cancelled while paused
    press('ArrowLeft') // ignored while paused
    press('ArrowDown')
    press(' ')
    press('Escape')
    expect($('#pause-screen').hidden).toBe(true)
    expect(rafCb).not.toBeNull() // game loop re-registered on resume
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })

  it('toggles pause with p and P', () => {
    $('#card-solo').click()
    press('p')
    expect($('#pause-screen').hidden).toBe(false)
    press('P')
    expect($('#pause-screen').hidden).toBe(true)
    press('P') // uppercase pauses too
    expect($('#pause-screen').hidden).toBe(false)
    press('p')
    expect($('#pause-screen').hidden).toBe(true)
  })
})

describe('solo game over', () => {
  it('tops out, shows the game-over screen and records a new best', () => {
    $('#card-solo').click()
    topOut()
    expect($('#gameover-screen').hidden).toBe(false)
    const finalScore = Number($('#final-score').innerText)
    expect(finalScore).toBeGreaterThan(0)
    expect(Number($('#final-best').innerText)).toBe(finalScore)
    expect($('#new-best').hidden).toBe(false)
    expect(window.localStorage.getItem('tetris-best')).toBe(String(finalScore))
    press('Escape') // no-op once the game is over
    expect($('#pause-screen').hidden).toBe(true)
    // the loop keeps rendering until the explosion settles, then stops
    for (let i = 0; i < 40; i++) frame(50)
    expect(rafCb).toBeNull()
  })

  it('tops out without a new best when the stored best is higher', async () => {
    window.localStorage.setItem('tetris-best', '999999')
    await boot() // re-import so main.js picks up the stored best
    expect(Number($('#best').innerText)).toBe(999999)
    $('#card-solo').click()
    topOut()
    expect($('#gameover-screen').hidden).toBe(false)
    expect(Number($('#final-score').innerText)).toBeGreaterThan(0)
    expect($('#new-best').hidden).toBe(true)
    expect(Number($('#final-best').innerText)).toBe(999999)
    expect(window.localStorage.getItem('tetris-best')).toBe('999999')
  })
})

describe('menu flow', () => {
  it('restarts a fresh solo game from the game-over screen', () => {
    $('#card-solo').click()
    topOut()
    expect($('#gameover-screen').hidden).toBe(false)
    $('#restart').click()
    expect($('#gameover-screen').hidden).toBe(true)
    expect($('#start-screen').hidden).toBe(true)
    frame()
    expect(score()).toBe(0)
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })

  it('returns to the menu from the game-over screen', () => {
    $('#card-solo').click()
    topOut()
    $('#menu-solo').click()
    expect($('#start-screen').hidden).toBe(false)
    expect($('#gameover-screen').hidden).toBe(true)
  })

  it('returns to the menu mid-game and can start again', () => {
    $('#card-solo').click()
    expect($('#start-screen').hidden).toBe(true)
    $('#menu-solo').click() // cancels the running loop
    expect($('#start-screen').hidden).toBe(false)
    expect(rafCb).toBeNull()
    $('#card-solo').click()
    press(' ')
    frame()
    expect(score()).toBeGreaterThan(0)
  })
})
