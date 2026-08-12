// ===========================================================================
// 飛行物理・アクション（第2フェーズ）。
// - 通常飛行: ピッチ±60°クランプ、ロール→ヨー連動（初版から継続）
// - ROLLING: Q/E・←→2度押しで720°バレルロール（arwing_react準拠、操縦は継続）
// - LOOPING: I/LOOPボタンで宙返り（機首方位の鉛直面内の円軌道）
// - UTURN: 境界超過でインメルマンターン（半ループ→ロールアウト→中心へ収束）
//   WARNING表示は廃止（演出のみで帰還を伝える）
// - 高度: 最低5 / 上限300（ソフト天井）
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C, MODE } from '../config.js'
import { playSnd, beep } from '../../audio/audio.js'
import { explodeSmall, spawnBlast } from './effects.js'
import { useGameStore } from '../../store/gameStore.js'

export const FLIGHT = {
  heading: 0,   // ヨー（rad）
  pitch: 0,     // ピッチ（rad, +が機首上げ）
  roll: 0,      // ロール（rad, +が左バンク）
  speed: C.speedNormal,
  // 宙返り（プレイヤー発動）の開始状態
  loop: { start: new THREE.Vector3(), heading: 0, pitch0: 0 },
  // インメルマン帰還の進行状態（camera.jsも参照する）
  ut: { phase: 'A', t: 0, heading0: 0, pitch0: 0, roll0: 0, start: new THREE.Vector3() },
}

// 自動テスト用フック（devのみ）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__F = FLIGHT
  // 山への手動レイキャスト（デバッグ用）
  window.__rayTest = (ox, oy, oz, dx, dy, dz, far = 2000) => {
    if (!G.colliders) return null
    _ray.set(
      new THREE.Vector3(ox, oy, oz),
      new THREE.Vector3(dx, dy, dz).normalize(),
    )
    _ray.far = far
    const h = _ray.intersectObject(G.colliders, true)[0]
    return h ? { dist: Math.round(h.distance), point: h.point.toArray().map((v) => Math.round(v)) } : null
  }
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _fwd = new THREE.Vector3()
const _fwdH = new THREE.Vector3()

const smoothstep = (p) => p * p * (3 - 2 * p)
// 角度差を -π..π に正規化
const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

// 機首方位の鉛直面内の円軌道（ang=0が開始点、πで頂点=高度+2r）
function circlePos(out, start, heading, r, ang) {
  _fwdH.set(-Math.sin(heading), 0, -Math.cos(heading))
  out.copy(start)
  out.y += r * (1 - Math.cos(ang))
  out.addScaledVector(_fwdH, r * Math.sin(ang))
}

export function initFlight() {
  const ship = G.ship
  if (!ship) return
  const F = FLIGHT
  F.heading = 0; F.pitch = 0; F.roll = 0
  F.speed = C.speedNormal
  G.act.mode = MODE.NORMAL
  G.act.rollTime = 0; G.act.loopTime = 0; G.act.touchBank = 0
  ship.position.set(0, G.stageCfg.startAltitude, 200)
  ship.quaternion.setFromEuler(_e.set(0, 0, 0, 'YXZ'))
  if (G.camera) {
    G.camera.position.set(0, G.stageCfg.startAltitude + C.camUp, 200 + C.camBack)
    G.camera.up.set(0, 1, 0)
    G.camera.lookAt(ship.position)
  }
}

// ---- アクション発動（input.js / TouchControls から呼ばれる） ----
export function startRoll(dir) {
  if (G.act.mode !== MODE.NORMAL) return
  G.act.mode = MODE.ROLLING
  G.act.rollDir = dir
  G.act.rollTime = 0
  playSnd('roll', 0.7)
}

export function startLoop() {
  if (G.act.mode !== MODE.NORMAL || !G.ship) return
  const F = FLIGHT
  G.act.mode = MODE.LOOPING
  G.act.loopTime = 0
  F.loop.start.copy(G.ship.position)
  F.loop.heading = F.heading
  F.loop.pitch0 = F.pitch
  playSnd('roll', 0.7)
}

// L/Rボタン: 2度押しでロール、長押しでバンク旋回（arwing_react準拠）
export function rollButtonPress(side) {
  if (G.act.mode !== MODE.NORMAL) return
  const t = G.state.time
  const gap = t - G.act.lastTap[side]
  G.act.lastTap[side] = t
  if (gap < C.doubleTapWindow) startRoll(side === 'L' ? 1 : -1)
  else G.act.touchBank = side === 'L' ? 1 : -1
}
export function rollButtonRelease() {
  G.act.touchBank = 0
}

// ---- シールドダメージ（一元管理）。0になったら墜落シーンへ ----
export function hitShield(amount) {
  if (G.act.mode === MODE.CRASH) return
  G.state.shield = Math.max(0, G.state.shield - amount)
  G.state.lastBounceT = G.state.time // 画面端の赤フラッシュ
  if (G.state.shield <= 0) startCrash()
}

// ---- 墜落シーン開始（シールド0）。操作不能できりもみ降下→爆発→GAME OVER ----
function startCrash() {
  const cr = G.crash
  cr.t = 0; cr.puffT = 0; cr.vy = 0; cr.exploded = false; cr.overT = 0
  G.act.mode = MODE.CRASH
  G.act.touchBank = 0
  G.shootHeld = false
  beep(150, 0.7, 'sawtooth', 0.3)  // 警告音
  beep(90, 1.2, 'triangle', 0.25)  // 低音でダウン感
}

function updateCrash(dt) {
  const ship = G.ship
  const F = FLIGHT
  const cr = G.crash
  cr.t += dt

  if (!cr.exploded) {
    // 機首がゆっくり下がり、きりもみ回転しながら重力で落ちる
    F.pitch += (C.crashPitch - F.pitch) * Math.min(1, 1.2 * dt)
    F.roll += C.crashRollSpeed * dt
    F.speed += (16 - F.speed) * Math.min(1, 1.5 * dt)
    ship.quaternion.setFromEuler(_e.set(F.pitch, F.heading, F.roll, 'YXZ'))
    _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
    ship.position.addScaledVector(_fwd, F.speed * dt)
    cr.vy += C.crashGravity * dt
    ship.position.y -= cr.vy * dt

    // 炎・煙のパフを引きながら落ちる
    cr.puffT -= dt
    if (cr.puffT <= 0) {
      cr.puffT = C.crashPuffInterval
      explodeSmall(ship.position, 2.4, 0.55, 0xff7a2b)
    }

    // 地面到達（草原）or 時間経過（宇宙・保険）で大爆発
    const hitGround = G.stageCfg.id !== 'space' && ship.position.y <= C.minAltitude + 1
    const timeUp = (G.stageCfg.id === 'space' && cr.t > C.crashTimeSpace) || cr.t > C.crashTimeMax
    if (hitGround || timeUp) crashExplode()
    return
  }

  // 爆発後: マルチ対戦中は pvp.js が復活/脱落を処理（GAME OVERにしない）
  cr.overT += dt
  if (G.match.active) return
  if (cr.overT >= C.crashToOver) {
    G.state.running = false
    const store = useGameStore.getState()
    store.setHud({ score: G.state.score, kills: G.state.kills, shield: 0 })
    store.setOver()
  }
}

function crashExplode() {
  const cr = G.crash
  if (cr.exploded) return
  cr.exploded = true
  spawnBlast(G.ship.position, { maxScale: 22, duration: 2.2 })
  explodeSmall(G.ship.position, 10, 1.2, 0xffffff)
  playSnd('bomb', 0.8)
  G.ship.visible = false
}

// ---- インメルマン開始（境界超過時の自動発動 + U-TURNボタン/Uキーの手動発動） ----
export function startUturn() {
  if (G.act.mode !== MODE.NORMAL && G.act.mode !== MODE.ROLLING) return
  if (!G.ship) return
  enterUturn()
}

function enterUturn() {
  const F = FLIGHT
  const u = F.ut
  u.phase = 'A'
  u.t = 0
  u.heading0 = F.heading
  u.pitch0 = F.pitch
  u.roll0 = F.roll
  u.start.copy(G.ship.position)
  G.act.mode = MODE.UTURN
  G.act.touchBank = 0
  playSnd('roll', 0.7)
}

// 毎フレームの入口: 移動前の位置を控えてから更新し、最後に山との衝突を解決する
const _prev = new THREE.Vector3()
export function updateFlight(dt) {
  if (!G.ship) return
  _prev.copy(G.ship.position)
  flightTick(dt)
  resolveMountainCollision()
}

function flightTick(dt) {
  const ship = G.ship
  if (!ship) return
  const F = FLIGHT
  const a = G.act
  const k = G.keys

  // 墜落中は入力・加減速も含めて専用処理（操作不能）
  if (a.mode === MODE.CRASH) {
    updateCrash(dt)
    return
  }

  // ---- 入力 ----
  let mx = 0, my = 0
  if (k['KeyA'] || k['ArrowLeft']) mx -= 1
  if (k['KeyD'] || k['ArrowRight']) mx += 1
  if (k['KeyW'] || k['ArrowUp']) my -= 1
  if (k['KeyS'] || k['ArrowDown']) my += 1
  if (G.touchAxis.active) { mx += G.touchAxis.x; my -= G.touchAxis.y }
  mx = THREE.MathUtils.clamp(mx, -1, 1)
  my = THREE.MathUtils.clamp(my, -1, 1)
  if (C.invertPitch) my = -my

  // ---- 加減速（Shift=ブースト / Ctrl=ブレーキ。Spaceはレーザー） ----
  let target = C.speedNormal
  const boost = !!(k['ShiftLeft'] || k['ShiftRight'])
  if (boost) target = C.speedBoost
  else if (k['ControlLeft'] || k['ControlRight']) target = C.speedBrake
  F.speed += (target - F.speed) * Math.min(1, C.speedLerp * dt)
  G.state.boost = boost

  // ---- モード別更新 ----
  if (a.mode === MODE.UTURN) {
    updateUturn(dt)
    return
  }

  if (a.mode === MODE.LOOPING) {
    // 宙返り: 入力無効。円軌道＋ピッチ2π回転
    a.loopTime += dt
    const p = Math.min(1, a.loopTime / C.loopDuration)
    const ang = smoothstep(p) * Math.PI * 2
    const blendIn = Math.min(1, p * 6) // 開始時の残ピッチを素早く円軌道へ馴染ませる
    const effPitch = F.loop.pitch0 * (1 - blendIn) + ang
    F.roll += (0 - F.roll) * Math.min(1, 6 * dt)
    ship.quaternion.setFromEuler(_e.set(effPitch, F.loop.heading, F.roll, 'YXZ'))
    circlePos(ship.position, F.loop.start, F.loop.heading, C.loopRadius, ang)
    if (p >= 1) {
      a.mode = MODE.NORMAL
      F.pitch = F.loop.pitch0 * 0 // 水平で復帰
      F.heading = F.loop.heading
    }
    applyFloor(dt)
    return
  }

  // ---- NORMAL / ROLLING 共通の操縦 ----
  // 境界超過 → インメルマン
  if (ship.position.length() > C.fieldRadius) {
    enterUturn()
    return
  }

  // ロール: キー入力 + L/Rボタン長押しバンク
  const bankInput = THREE.MathUtils.clamp(-mx + a.touchBank, -1, 1)
  const targetRoll = bankInput * C.rollMax
  F.roll += (targetRoll - F.roll) * Math.min(1, C.rollLerp * dt)
  F.heading += Math.sin(F.roll) * C.yawFactor * dt
  F.pitch = THREE.MathUtils.clamp(F.pitch + my * C.pitchRate * dt, -C.pitchClamp, C.pitchClamp)

  // バレルロール（720°）は見た目のロール角として加算（操縦は継続 = arwing準拠）
  let visualRoll = 0
  if (a.mode === MODE.ROLLING) {
    a.rollTime += dt
    const p = Math.min(1, a.rollTime / C.rollDuration)
    visualRoll = a.rollDir * smoothstep(p) * Math.PI * 4
    if (p >= 1) a.mode = MODE.NORMAL
  }

  ship.quaternion.setFromEuler(_e.set(F.pitch, F.heading, F.roll + visualRoll, 'YXZ'))

  // 前進
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  ship.position.addScaledVector(_fwd, F.speed * dt)

  // 球状フィールド内に収める（通常時のみ。UTURN中は超過を許容）
  const dist = ship.position.length()
  if (dist > C.fieldRadius) ship.position.multiplyScalar(C.fieldRadius / dist)

  applyCeiling(dt)
  applyFloor(dt)
}

// ---- インメルマンターン（半ループ→ロールアウト→中心方向へ収束） ----
function updateUturn(dt) {
  const ship = G.ship
  const F = FLIGHT
  const u = F.ut
  u.t += dt

  if (u.phase === 'A') {
    // 引き起こし: ピッチ0→180°の半ループ。頂点で背面・方位反転
    const p = Math.min(1, u.t / C.uturnHalfLoopTime)
    const ang = smoothstep(p) * Math.PI
    const blendIn = Math.min(1, p * 6)
    const effPitch = u.pitch0 * (1 - blendIn) + ang
    const rollA = u.roll0 * (1 - blendIn) // 進入時のバンクを素早く水平へ
    ship.quaternion.setFromEuler(_e.set(effPitch, u.heading0, rollA, 'YXZ'))
    circlePos(ship.position, u.start, u.heading0, C.uturnRadius, ang)
    if (p >= 1) {
      // 背面(ピッチ180°) ≡ 方位+180°でロール180° に表現を切替
      F.heading = u.heading0 + Math.PI
      F.pitch = 0
      u.phase = 'B'
      u.t = 0
    }
    return
  }

  if (u.phase === 'B') {
    // ロールアウト: 背面(180°)→水平(0°)。前進は継続
    const p = Math.min(1, u.t / C.uturnRolloutTime)
    const rollB = Math.PI * (1 - smoothstep(p))
    ship.quaternion.setFromEuler(_e.set(0, F.heading, rollB, 'YXZ'))
    advanceStraight(dt)
    if (p >= 1) { u.phase = 'C'; u.t = 0; F.roll = 0 }
    return
  }

  // Phase C: 機首をフィールド中心方向へ滑らかに収束
  const toCenter = Math.atan2(ship.position.x, ship.position.z) // 中心向き方位（下の導出参照）
  // forward=(-sin h,0,-cos h) が -pos 方向を向く h: sin h = x/|p|, cos h = z/|p|
  const d = angDiff(F.heading, toCenter)
  F.heading += d * Math.min(1, 3 * dt)
  ship.quaternion.setFromEuler(_e.set(0, F.heading, 0, 'YXZ'))
  advanceStraight(dt)
  if (Math.abs(d) < 0.12 || u.t > 1.5) {
    G.act.mode = MODE.NORMAL
    F.pitch = 0
    F.roll = 0
  }
}

// ---- 障害物との衝突（はじかれ判定）。草原=山 / 宇宙=隕石・衛星（G.colliders） ----
// 移動前→移動後の線分でレイキャストし、当たったら面の法線で進行方向を反射。
// 演出（宙返り/帰還）中に当たった場合は演出を中断して通常操作へ戻す。
const _ray = new THREE.Raycaster()
_ray.firstHitOnly = true // three-mesh-bvh の高速最近傍ヒット
const _move = new THREE.Vector3()
const _n = new THREE.Vector3()
const _refl = new THREE.Vector3()

function resolveMountainCollision() {
  const ship = G.ship
  if (!ship || !G.colliders) return
  const F = FLIGHT
  _move.copy(ship.position).sub(_prev)
  const len = _move.length()
  if (len < 1e-6) return
  _move.divideScalar(len)
  _ray.set(_prev, _move)
  _ray.far = len + C.bounceMargin
  const hit = _ray.intersectObject(G.colliders, true)[0]
  if (!hit) return

  // 墜落中に障害物へ突っ込んだら、その場で大爆発（跳ね返さない）
  if (G.act.mode === MODE.CRASH) {
    ship.position.copy(hit.point)
    crashExplode()
    return
  }

  // 衝突面の法線（ワールド座標）。取れない場合は進行方向の逆を使う
  if (hit.face) {
    _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize()
    if (_n.dot(_move) > 0) _n.negate()
  } else {
    _n.copy(_move).negate()
  }

  // 進行方向を反射 → 新しい方位・ピッチへ変換
  _refl.copy(_move).addScaledVector(_n, -2 * _move.dot(_n)).normalize()
  F.heading = Math.atan2(-_refl.x, -_refl.z)
  F.pitch = THREE.MathUtils.clamp(
    Math.asin(THREE.MathUtils.clamp(_refl.y, -1, 1)),
    -C.pitchClamp, C.pitchClamp,
  )
  if (G.act.mode !== MODE.NORMAL) G.act.mode = MODE.NORMAL // 演出中断
  ship.quaternion.setFromEuler(_e.set(F.pitch, F.heading, F.roll, 'YXZ'))
  ship.position.copy(hit.point).addScaledVector(_n, C.bounceMargin)
  F.speed = Math.max(C.speedBrake, F.speed * C.bounceSpeedKeep)
  beep(90, 0.25, 'sawtooth', 0.25) // 衝突音
  hitShield(C.damageBounce)        // シールド減少（lastBounceT=赤フラッシュもここで更新）
}

function advanceStraight(dt) {
  const ship = G.ship
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  ship.position.addScaledVector(_fwd, FLIGHT.speed * dt)
  applyFloor(dt)
}

// ---- 高度制限（範囲はステージ別: 草原=5〜150 / 宇宙=-250〜250） ----
function applyCeiling(dt) {
  const ship = G.ship
  const F = FLIGHT
  const maxAlt = G.stageCfg.maxAltitude
  if (ship.position.y > maxAlt) {
    // ソフト天井: なめらかに押し戻し、機首を水平へ
    ship.position.y += (maxAlt - ship.position.y) * Math.min(1, 2.5 * dt)
    if (F.pitch > 0) F.pitch += (0 - F.pitch) * Math.min(1, 4 * dt)
    if (ship.position.y > maxAlt + 40) ship.position.y = maxAlt + 40
  }
}

function applyFloor(dt) {
  const ship = G.ship
  const F = FLIGHT
  if (ship.position.y < G.stageCfg.minAltitude) {
    ship.position.y = G.stageCfg.minAltitude
    if (G.act.mode === MODE.NORMAL && F.pitch < 0) {
      F.pitch += (0 - F.pitch) * Math.min(1, 4 * dt)
    }
  }
}
