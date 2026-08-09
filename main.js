import {
  GAME_STATE,
  DAS,
  ARR,
  BASE_FACTOR,
  TURBO_FACTOR,
  TURBO_LOCK_DELAY,
  VS_DURATION,
  DOOM_MESSAGES
} from './utils/constants'
import { createPiece, createBagFeed } from './utils/pieces'
import { createEngine } from './utils/engine'
import { createBoardRenderer, drawQueue, drawHold } from './utils/canvas'
import { createEffects } from './utils/effects'
import { createAiController } from './utils/ai'
import './style.css'

// modes
const MODE = { SOLO: 'solo', VERSUS: 'versus' }
let mode = MODE.SOLO
let state = GAME_STATE.START

// solo best
let best = Number(window.localStorage.getItem('tetris-best')) || 0

// games
let engine = null
let effects = null
let aiEngine = null
let aiEffects = null
let aiController = null
let timer = 0

// game loop
let lastTime = 0
let rafId = null
let countdownUntil = 0

// auto-shift input state
const input = { left: false, right: false, dir: 0, dasStart: 0, arrLast: 0 }

// dom
const $stage = document.querySelector('#player-stage')
const $aiSide = document.querySelector('.ai-side')
const $aiStage = document.querySelector('.ai-stage')
const $match = document.querySelector('.match')
const $startScreen = document.querySelector('#start-screen')
const $pauseScreen = document.querySelector('#pause-screen')
const $gameoverScreen = document.querySelector('#gameover-screen')
const $resultScreen = document.querySelector('#result-screen')
const $cardSolo = document.querySelector('#card-solo')
const $cardVersus = document.querySelector('#card-versus')
const $score = document.querySelector('#score')
const $level = document.querySelector('#level')
const $lines = document.querySelector('#lines')
const $best = document.querySelector('#best')
const $timerCard = document.querySelector('#timer-card')
const $timer = document.querySelector('#timer')
const $youScore = document.querySelector('#you-score')
const $youLines = document.querySelector('#you-lines')
const $aiScore = document.querySelector('#ai-score')
const $aiLines = document.querySelector('#ai-lines')
const $finalScore = document.querySelector('#final-score')
const $finalLevel = document.querySelector('#final-level')
const $finalBest = document.querySelector('#final-best')
const $newBest = document.querySelector('#new-best')
const $restart = document.querySelector('#restart')
const $menuSolo = document.querySelector('#menu-solo')
const $resultTitle = document.querySelector('#result-title')
const $resultYou = document.querySelector('#result-you')
const $resultAi = document.querySelector('#result-ai')
const $rematch = document.querySelector('#rematch')
const $menu = document.querySelector('#menu')
const $countdownOverlay = document.querySelector('#countdown-overlay')
const $countdownNumber = document.querySelector('#countdown-number')
const $doomMessage = document.querySelector('#doom-message')

// renderers
const playerRenderer = createBoardRenderer(document.querySelector('#board'))
const aiRenderer = createBoardRenderer(document.querySelector('#ai-board'))

// --- panels & hud ---

function updatePanels () {
  drawQueue(engine.queue)
  drawHold(engine.heldType ? createPiece(engine.heldType) : null, engine.canHold)
}

function formatTime (ms) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function writeHud () {
  $score.innerText = engine.score
  $level.innerText = engine.level
  $lines.innerText = engine.lines
  $best.innerText = best
  if (mode === MODE.VERSUS && aiEngine) {
    $youScore.innerText = engine.score
    $youLines.innerText = engine.lines
    $timer.innerText = formatTime(timer)
    $timerCard.classList.toggle('low', timer <= 30000)
    $aiScore.innerText = aiEngine.score
    $aiLines.innerText = aiEngine.lines
  }
}

// --- engine events ---

function handleEvent (event, side) {
  if (event.type === 'clear') {
    const fx = side === 'ai' ? aiEffects : effects
    fx.spawnLineClear(event.rows, event.board, event.points, event.label)
  }
  if (side === 'player' && (event.type === 'spawn' || event.type === 'hold' || event.type === 'lock')) {
    updatePanels()
  }
  if (event.type === 'gameover') {
    onEngineGameOver(side)
  }
}

function onEngineGameOver (side) {
  if (mode === MODE.SOLO) {
    soloGameOver()
    return
  }
  // versus: the side that topped out loses instantly
  const playerWon = side === 'ai'
  const loserEngine = playerWon ? aiEngine : engine
  const loserFx = playerWon ? aiEffects : effects
  loserFx.spawnBoardClear(loserEngine.board)
  loserEngine.board.forEach(row => row.fill(0))
  finishVersus(playerWon)
}

function soloGameOver () {
  state = GAME_STATE.GAME_OVER
  effects.spawnBoardClear(engine.board)
  engine.board.forEach(row => row.fill(0))

  const isNewBest = engine.score > best
  if (isNewBest) {
    best = engine.score
    window.localStorage.setItem('tetris-best', String(best))
  }

  $finalScore.innerText = engine.score
  $finalLevel.innerText = engine.level
  $finalBest.innerText = best
  $newBest.hidden = !isNewBest

  // let the explosion play before showing the screen
  window.setTimeout(() => {
    if (state === GAME_STATE.GAME_OVER) {
      $gameoverScreen.hidden = false
    }
  }, 900)
}

function finishVersus (playerWon) {
  if (state !== GAME_STATE.PLAYING) return
  state = GAME_STATE.GAME_OVER

  $resultTitle.innerText = playerWon ? 'VICTORY!' : 'DEFEAT'
  $resultTitle.classList.toggle('danger', !playerWon)
  $resultYou.innerText = engine.score
  $resultAi.innerText = aiEngine.score
  $menu.innerText = playerWon ? 'Menu' : '🏳️ I surrender'

  window.setTimeout(() => {
    if (state === GAME_STATE.GAME_OVER) {
      $resultScreen.hidden = false
    }
  }, 900)
}

// --- input ---

// DAS/ARR auto-shift, driven from the game loop
function updateAutoShift (now) {
  if (input.dir === 0) return
  if (now - input.dasStart < DAS) return
  if (now - input.arrLast >= ARR) {
    engine.move(input.dir)
    input.arrLast = now
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    if (state === GAME_STATE.PLAYING) pauseGame()
    else if (state === GAME_STATE.PAUSED) resumeGame()
    return
  }

  if (state !== GAME_STATE.PLAYING) return

  const handled = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'c', 'C', 'Shift']
  if (handled.includes(event.key)) event.preventDefault()

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const dir = event.key === 'ArrowLeft' ? -1 : 1
    if (dir === -1) input.left = true
    else input.right = true
    if (!event.repeat) {
      input.dir = dir
      input.dasStart = performance.now()
      input.arrLast = performance.now()
      engine.move(dir)
    }
  }
  if (event.key === 'ArrowDown') engine.softDrop()
  if (event.key === 'ArrowUp' && !event.repeat) engine.rotate()
  if (event.key === ' ' && !event.repeat) engine.hardDrop()
  // hold is disabled in doom mode
  if ((event.key === 'c' || event.key === 'C' || event.key === 'Shift') && !event.repeat && mode !== MODE.VERSUS) engine.hold()
})

document.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft') {
    input.left = false
    if (input.dir === -1) input.dir = input.right ? 1 : 0
  }
  if (event.key === 'ArrowRight') {
    input.right = false
    if (input.dir === 1) input.dir = input.left ? -1 : 0
  }
})

// --- game loop ---

function update (time = 0) {
  const rawDelta = time - lastTime
  lastTime = time
  const now = performance.now()

  if (state === GAME_STATE.COUNTDOWN) {
    const remaining = countdownUntil - now
    $countdownNumber.innerText = Math.max(1, Math.ceil(remaining / 1000))
    if (remaining <= 0) {
      state = GAME_STATE.PLAYING
      $countdownOverlay.hidden = true
    }
  }

  if (state === GAME_STATE.PLAYING) {
    updateAutoShift(now)
    engine.step(rawDelta * effects.getTimeScale())

    if (mode === MODE.VERSUS) {
      aiController.step(now)
      aiEngine.step(rawDelta * aiEffects.getTimeScale())
      timer -= rawDelta
      if (timer <= 0) {
        timer = 0
        finishVersus(engine.score > aiEngine.score)
      }
    }
  }

  const effectsActive = effects.updateEffects(rawDelta)
  playerRenderer.draw({
    board: engine.board,
    piece: state === GAME_STATE.GAME_OVER && mode === MODE.SOLO ? null : engine.piece,
    clearingRows: engine.clearing ? engine.clearing.rows : null
  })
  effects.drawEffects()
  applyShake($stage, effects.getShakeOffset())

  let aiActive = false
  if (mode === MODE.VERSUS && aiEngine) {
    aiActive = aiEffects.updateEffects(rawDelta)
    aiRenderer.draw({
      board: aiEngine.board,
      piece: aiEngine.piece,
      clearingRows: aiEngine.clearing ? aiEngine.clearing.rows : null
    })
    aiEffects.drawEffects()
    applyShake($aiStage, aiEffects.getShakeOffset())
  }

  writeHud()

  // keep rendering during countdown and until game over explosions settle
  if (
    state === GAME_STATE.PLAYING ||
    state === GAME_STATE.COUNTDOWN ||
    (state === GAME_STATE.GAME_OVER && (effectsActive || aiActive))
  ) {
    rafId = window.requestAnimationFrame(update)
  } else {
    rafId = null
  }
}

function applyShake (el, offset) {
  el.style.transform = offset.x === 0 && offset.y === 0
    ? ''
    : `translate(${offset.x}px, ${offset.y}px)`
}

// --- game flow ---

function startPlaying () {
  state = GAME_STATE.PLAYING
  input.left = false
  input.right = false
  input.dir = 0
  updatePanels()

  $startScreen.hidden = true
  $pauseScreen.hidden = true
  $gameoverScreen.hidden = true
  $resultScreen.hidden = true
  $countdownOverlay.hidden = true
  $cardSolo.blur()
  $cardVersus.blur()
  $restart.blur()
  $menuSolo.blur()
  $rematch.blur()
  $menu.blur()

  if (rafId !== null) window.cancelAnimationFrame(rafId)
  lastTime = performance.now()
  rafId = window.requestAnimationFrame(update)
}

function setActiveCard (active) {
  $cardSolo.classList.toggle('active', active === MODE.SOLO)
  $cardVersus.classList.toggle('active', active === MODE.VERSUS)
}

function startSolo () {
  mode = MODE.SOLO
  document.body.dataset.mode = 'solo'
  $aiSide.hidden = true
  $match.hidden = true
  setActiveCard(MODE.SOLO)

  effects = createEffects(playerRenderer.context)
  engine = createEngine({ nextType: createBagFeed(), speedFactor: BASE_FACTOR, onEvent: e => handleEvent(e, 'player') })
  aiEngine = null
  aiEffects = null
  aiController = null

  startPlaying()
}

function startVersus () {
  mode = MODE.VERSUS
  document.body.dataset.mode = 'versus'
  $aiSide.hidden = false
  $match.hidden = false
  setActiveCard(MODE.VERSUS)

  const feed = createBagFeed() // same piece sequence for both boards
  effects = createEffects(playerRenderer.context)
  aiEffects = createEffects(aiRenderer.context)
  engine = createEngine({ nextType: feed, lockDelay: TURBO_LOCK_DELAY, speedFactor: TURBO_FACTOR, onEvent: e => handleEvent(e, 'player') })
  aiEngine = createEngine({ nextType: feed, lockDelay: TURBO_LOCK_DELAY, speedFactor: TURBO_FACTOR, onEvent: e => handleEvent(e, 'ai') })
  aiController = createAiController(aiEngine)
  timer = VS_DURATION

  beginCountdown()
}

// dramatic countdown before the doom match starts
function beginCountdown () {
  state = GAME_STATE.COUNTDOWN
  input.left = false
  input.right = false
  input.dir = 0
  updatePanels()

  $startScreen.hidden = true
  $pauseScreen.hidden = true
  $gameoverScreen.hidden = true
  $resultScreen.hidden = true
  $cardSolo.blur()
  $cardVersus.blur()
  $rematch.blur()
  $menu.blur()

  $doomMessage.innerText = DOOM_MESSAGES[Math.floor(Math.random() * DOOM_MESSAGES.length)]
  $countdownNumber.innerText = 3
  $countdownOverlay.hidden = false
  countdownUntil = performance.now() + 3000

  if (rafId !== null) window.cancelAnimationFrame(rafId)
  lastTime = performance.now()
  rafId = window.requestAnimationFrame(update)
}

function goToMenu () {
  state = GAME_STATE.START
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  document.body.dataset.mode = 'solo'
  $aiSide.hidden = true
  $match.hidden = true
  setActiveCard(null)
  $gameoverScreen.hidden = true
  $resultScreen.hidden = true
  $pauseScreen.hidden = true
  $countdownOverlay.hidden = true
  $stage.style.transform = ''
  $aiStage.style.transform = ''
  $startScreen.hidden = false
  $menu.blur()
  $menuSolo.blur()
}

let pauseStart = 0

function pauseGame () {
  state = GAME_STATE.PAUSED
  pauseStart = performance.now()
  window.cancelAnimationFrame(rafId)
  rafId = null
  input.left = false
  input.right = false
  input.dir = 0
  $stage.style.transform = ''
  $aiStage.style.transform = ''
  $pauseScreen.hidden = false
}

function resumeGame () {
  // freeze timers for the paused duration
  const pausedFor = performance.now() - pauseStart
  engine.shiftTimers(pausedFor)
  if (aiEngine) aiEngine.shiftTimers(pausedFor)

  state = GAME_STATE.PLAYING
  $pauseScreen.hidden = true
  lastTime = performance.now()
  rafId = window.requestAnimationFrame(update)
}

// --- boot ---

document.body.dataset.mode = 'solo'
effects = createEffects(playerRenderer.context)
engine = createEngine({ nextType: createBagFeed(), onEvent: () => {} })
updatePanels()
playerRenderer.draw({ board: engine.board, piece: engine.piece, clearingRows: null })
writeHud()

$cardSolo.addEventListener('click', startSolo)
$cardVersus.addEventListener('click', startVersus)
$restart.addEventListener('click', startSolo)
$menuSolo.addEventListener('click', goToMenu)
$rematch.addEventListener('click', startVersus)
$menu.addEventListener('click', goToMenu)
