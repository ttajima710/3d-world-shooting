// ゲーム開始制御（タイトル画面のボタンから呼ばれる）
import { G } from './state.js'
import { CONFIG, MODE, STAGES } from './config.js'
import { initFlight } from './systems/flight.js'
import { resetEnemies, clearEnemies } from './systems/enemies.js'
import { resetItems } from './systems/items.js'
import { resumeAudio } from '../audio/audio.js'
import { useGameStore } from '../store/gameStore.js'

// npc=false はマルチ対戦用（コンピューターの敵機を出さない）
export function startGame({ npc = true } = {}) {
  // 選択中ステージの設定（高度範囲など）を反映
  const store0 = useGameStore.getState()
  G.stageCfg = STAGES[store0.stage] || STAGES.grass

  // 前回の弾・爆発を掃除
  if (G.rootScene) {
    for (const arr of [G.lasers, G.bombs, G.blasts]) {
      for (const o of arr) G.rootScene.remove(o)
      arr.length = 0
    }
  }
  G.keys = {}
  G.escPressed = false
  G.shootHeld = false
  G.state.time = 0
  G.state.running = true
  G.state.fireCd = 0
  G.state.score = 0
  G.state.shield = CONFIG.shieldMax
  G.state.kills = 0
  G.state.lastBounceT = -99 // 前回プレイの衝突フラッシュを持ち越さない
  G.state.lastHitT = -99
  G.state.lastDamageT = -99
  G.state.hitGraceT = 0
  G.crash.t = 0; G.crash.exploded = false; G.crash.overT = 0; G.crash.vy = 0
  if (G.ship) G.ship.visible = true // 墜落で消えた機体を復活
  G.act.mode = MODE.NORMAL
  G.act.bombs = CONFIG.bombStart
  // 強化アイテムの成果は1プレイ限り（毎回まっさらから始める）
  G.act.laserLv = 1
  G.act.laserPickups = 0
  G.act.goldCount = 0
  G.act.shieldMax = CONFIG.shieldMax
  G.act.lastTap.L = -99
  G.act.lastTap.R = -99
  G.act.touchBank = 0
  G.touchAxis.x = 0; G.touchAxis.y = 0; G.touchAxis.active = false
  // マッチ状態も毎回リセット（対戦時は pvp.startMatchLocal がこの後に上書きする）
  G.match.active = false
  G.match.alive = true
  G.match.invT = 0
  G.match.lastAttacker = null
  G.match.downAnnounced = false
  initFlight()
  if (npc) resetEnemies()
  else clearEnemies()
  resetItems()
  resumeAudio()
  const store = useGameStore.getState()
  store.setHud({
    score: 0,
    bombs: CONFIG.bombStart,
    shield: CONFIG.shieldMax,
    shieldMax: CONFIG.shieldMax,
    laserLv: 1,
    gold: 0,
    kills: 0,
    flash: false,
    radar: { rx: 0, rz: 0.2, hd: 0, out: false, alt: G.stageCfg.startAltitude, enemies: [], players: [], items: [] },
  })
  store.setPlaying()
}
