import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// fake 2d context: every method is a vi.fn(), gradients stubbed
function makeFakeCtx () {
  return new Proxy({}, {
    get (t, p) {
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      if (!(p in t)) t[p] = vi.fn()
      return t[p]
    },
    set (t, p, v) { t[p] = v; return true }
  })
}

let rafCb = null
let now = 0

async function boot () {
  vi.resetModules()
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1]
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeFakeCtx())
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  window.requestAnimationFrame = cb => { rafCb = cb; return 1 }
  window.cancelAnimationFrame = () => { rafCb = null }
  // result-screen delay becomes instant
  vi.spyOn(window, 'setTimeout').mockImplementation(cb => { cb(); return 0 })
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  await import('../main.js')
}

// advance the fake clock and run one animation frame
function frame (dt) {
  now += dt
  const cb = rafCb
  rafCb = null
  if (cb) cb(now)
}

function press (key) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key }))
}

function release (key) {
  document.dispatchEvent(new window.KeyboardEvent('keyup', { key }))
}

function $ (selector) {
  return document.querySelector(selector)
}

function startVersus () {
  $('#card-versus').click()
}

// run the three 1s countdown frames; ends in PLAYING state
function finishCountdown () {
  frame(1000)
  frame(1000)
  frame(1000)
}

describe('main.js versus mode (doom)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await boot()
  })

  afterEach(() => {
    rafCb = null
    vi.restoreAllMocks()
  })

  it('starts the doom countdown when clicking the Vs AI card', () => {
    startVersus()
    expect(document.body.dataset.mode).toBe('versus')
    expect($('#countdown-overlay').hidden).toBe(false)
    expect(String($('#countdown-number').innerText)).toBe('3')
    expect($('#doom-message').innerText.length).toBeGreaterThan(0)
    expect($('.ai-side').hidden).toBe(false)
    expect($('.match').hidden).toBe(false)
    expect($('#start-screen').hidden).toBe(true)
    expect($('#result-screen').hidden).toBe(true)
  })

  it('counts down 3-2-1, then hides the overlay and starts the match', () => {
    startVersus()
    frame(1000)
    expect(String($('#countdown-number').innerText)).toBe('2')
    expect($('#countdown-overlay').hidden).toBe(false)
    frame(1000)
    expect(String($('#countdown-number').innerText)).toBe('1')
    frame(1000)
    expect($('#countdown-overlay').hidden).toBe(true)
    expect($('#timer').innerText).toBe('2:59')
  })

  it('updates the versus HUD and marks the timer card low under 30s', () => {
    startVersus()
    frame(1000) // still counting down, HUD already live
    expect($('#timer').innerText).toBe('3:00')
    expect(String($('#you-score').innerText)).toBe('0')
    expect(String($('#you-lines').innerText)).toBe('0')
    expect(String($('#ai-score').innerText)).toBe('0')
    expect(String($('#ai-lines').innerText)).toBe('0')
    expect($('#timer-card').classList.contains('low')).toBe(false)
    frame(1000)
    frame(1000) // countdown over, match playing
    frame(160000) // jump deep into the match
    expect($('#timer').innerText).toBe('0:19')
    expect($('#timer-card').classList.contains('low')).toBe(true)
  })

  it('lets the AI play, score and clear lines by itself', () => {
    startVersus()
    finishCountdown()
    let frames = 0
    while (String($('#ai-lines').innerText) === '0' && frames < 600) {
      frame(60) // the Dellacherie AI clears lines every few pieces
      frames++
    }
    expect(Number($('#ai-score').innerText)).toBeGreaterThan(0)
    expect(Number($('#ai-lines').innerText)).toBeGreaterThan(0)
  })

  it('handles movement, rotation, drops and auto-shift; hold stays disabled', () => {
    startVersus()
    finishCountdown()

    press('ArrowLeft')
    frame(200) // DAS elapsed, auto-shift repeats the move
    frame(60) // ARR repeat
    release('ArrowLeft')
    press('ArrowRight')
    release('ArrowRight')
    press('ArrowUp') // rotate
    press('ArrowDown') // soft drop
    press(' ') // hard drop scores
    frame(60)
    expect(Number($('#you-score').innerText)).toBeGreaterThan(0)

    press('c') // hold is disabled in doom mode: no crash, match continues
    frame(60)
    expect($('#pause-screen').hidden).toBe(true)
    expect($('#result-screen').hidden).toBe(true)
    expect($('#countdown-overlay').hidden).toBe(true)
    expect(Number($('#you-score').innerText)).toBeGreaterThan(0)
  })

  it('ends in VICTORY when the timer expires with the player ahead', () => {
    startVersus()
    finishCountdown()
    press(' ') // build a lead the AI cannot close in the final frames
    press(' ')
    press(' ')
    press(' ')
    frame(60)
    expect(Number($('#you-score').innerText)).toBeGreaterThan(0)
    frame(200000) // timer expires
    expect($('#result-screen').hidden).toBe(false)
    expect($('#result-title').innerText).toBe('VICTORY!')
    expect($('#result-title').classList.contains('danger')).toBe(false)
    expect($('#menu').innerText).toBe('Menu')
  })

  it('ends in DEFEAT when the timer expires with the player behind', () => {
    startVersus()
    finishCountdown()
    frame(200000) // timer expires with both scores at 0
    expect($('#result-screen').hidden).toBe(false)
    expect($('#result-title').innerText).toBe('DEFEAT')
    expect($('#result-title').classList.contains('danger')).toBe(true)
    expect($('#menu').innerText).toContain('surrender')
    expect(String($('#result-you').innerText)).toBe('0')
  })

  it('ends in DEFEAT when the player tops out', () => {
    startVersus()
    finishCountdown()
    for (let i = 0; i < 100 && $('#result-screen').hidden; i++) {
      press(' ') // drop straight down until the board reaches the top
      frame(60)
    }
    expect($('#result-screen').hidden).toBe(false)
    expect($('#result-title').innerText).toBe('DEFEAT')
    expect($('#result-title').classList.contains('danger')).toBe(true)
  })

  it('restarts a fresh versus countdown on rematch', () => {
    startVersus()
    finishCountdown()
    frame(200000) // end the match
    expect($('#result-screen').hidden).toBe(false)
    $('#rematch').click()
    expect($('#result-screen').hidden).toBe(true)
    expect($('#countdown-overlay').hidden).toBe(false)
    expect(String($('#countdown-number').innerText)).toBe('3')
    expect(document.body.dataset.mode).toBe('versus')
    finishCountdown() // the new match can play
    expect($('#countdown-overlay').hidden).toBe(true)
  })

  it('returns to the start screen via the result-screen menu button', () => {
    startVersus()
    finishCountdown()
    frame(200000)
    $('#menu').click()
    expect($('#start-screen').hidden).toBe(false)
    expect(document.body.dataset.mode).toBe('solo')
    expect($('.ai-side').hidden).toBe(true)
    expect($('.match').hidden).toBe(true)
    expect($('#result-screen').hidden).toBe(true)
  })

  it('returns to the menu while a match is still running', () => {
    startVersus()
    finishCountdown()
    frame(60) // a frame is pending: goToMenu must cancel the loop
    $('#menu').click()
    expect($('#start-screen').hidden).toBe(false)
    expect(document.body.dataset.mode).toBe('solo')
    expect($('.ai-side').hidden).toBe(true)
    expect($('.match').hidden).toBe(true)
  })

  it('pauses and resumes mid-match, shifting both engines timers', () => {
    startVersus()
    finishCountdown()
    frame(60)
    const before = $('#timer').innerText
    press('Escape')
    expect($('#pause-screen').hidden).toBe(false)
    now += 5000 // time passes while paused; engine timers must shift on resume
    press('Escape')
    expect($('#pause-screen').hidden).toBe(true)
    frame(5000)
    expect($('#timer').innerText).not.toBe(before)
    expect($('#result-screen').hidden).toBe(true)
  })
})
