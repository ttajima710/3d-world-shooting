// ===========================================================================
// キーボード + マウス入力（arwing_react input.js 準拠に更新）。
// 押しっぱなし状態は G.keys、発射は G.shootHeld（GameTickが連射制御）。
// エッジトリガ: ←→/Q/E 2度押し=バレルロール、B/K=ボム、I=宙返り、U=Uターン。
// ===========================================================================
import { G } from '../game/state.js'
import { CONFIG, MODE } from '../game/config.js'
import { startRoll, startLoop, startUturn } from '../game/systems/flight.js'
import { launchBomb, triggerBombDetonations } from '../game/systems/weapons.js'

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function onKeyPress(code) {
  const a = G.act
  const t = G.state.time
  const isLeft = code === 'KeyQ' || code === 'ArrowLeft'
  const isRight = code === 'KeyE' || code === 'ArrowRight'
  if ((isLeft || isRight) && a.mode === MODE.NORMAL) {
    const side = isLeft ? 'L' : 'R'
    const gap = t - a.lastTap[side]
    a.lastTap[side] = t
    if (gap < CONFIG.doubleTapWindow) startRoll(isLeft ? 1 : -1)
  }
  if (code === 'KeyB' || code === 'KeyK') {
    if (!triggerBombDetonations()) launchBomb()
  }
  if (code === 'KeyI' && a.mode === MODE.NORMAL) startLoop()
  if (code === 'KeyU') startUturn()
  // ESCは押した事実をラッチする（低fps時、1フレーム内の押して離しでも確実に拾う）
  if (code === 'Escape') G.escPressed = true
}

let bound = false
export function installInput(domElement) {
  if (bound) return
  bound = true

  addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault()
    if (e.repeat) return
    const wasUp = !G.keys[e.code]
    G.keys[e.code] = true
    if (G.state.running && wasUp) onKeyPress(e.code)
  })
  addEventListener('keyup', (e) => { G.keys[e.code] = false })
  addEventListener('blur', () => { G.keys = {}; G.shootHeld = false })

  // デスクトップ: キャンバスクリックで発射（arwing準拠）
  if (domElement) {
    domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') G.shootHeld = true
    })
  }
  addEventListener('pointerup', (e) => {
    if (!e.pointerType || e.pointerType === 'mouse') G.shootHeld = false
  })
}
