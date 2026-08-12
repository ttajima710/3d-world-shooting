// Fixed aiming reticle: a square made of four corner brackets PLUS a short
// diagonal line at each corner pointing toward the centre. It is drawn at the
// point the laser is heading toward (straight ahead of the ship) and is ALWAYS
// shown during play — it does NOT track or react to enemies. A second, smaller
// reticle is placed further ahead so the player can line up the two like a
// gun's front/rear sights and aim more easily.
// Ported from arwing_react/src/game/systems/targeting.js. Generalized for
// omnidirectional flight: the reticles sit along the ship's forward vector
// (its quaternion) instead of a fixed -Z direction, and are parented to
// G.rootScene instead of G.scene.
import * as THREE from 'three'
import { G } from '../state.js'
import { NET } from '../../net/net.js'

const COLOR = 0xc8ffd6 // 発光グリーン（白寄りにして濃い縁取りとの明暗差を大きく）
const OUTLINE_COLOR = 0x001206 // 明るい空でも輪郭が残るよう、緑の裏に敷く濃色
// 濃色を「わずかに大きい／小さい」2枚重ねて、緑の線の両脇に細い縁取りを作る。
// 大きく離すと別枠に見えてしまうので、差はごく小さくすること。
const OUTLINE_SCALE = 1.05
const OUTLINE_SCALE_IN = 0.95

// 手前側（標準）レチクル
const AIM_DIST = 38     // forward distance of the near reticle (where the laser is heading)
const SIZE = 5          // near reticle scale

// 奥側（小）レチクル — 前方の奥に置いて、標準を狙いやすくするための照準
const AIM_DIST_FAR = 50  // forward distance of the far reticle (further along the laser path)
const SIZE_FAR = 3.2     // far reticle scale (smaller, so it appears tiny in the centre)

let reticle = null     // 手前（標準）
let reticleFar = null  // 奥（小）
let reticleBack = null    // 手前の縁取り（濃色・外側）
let reticleBackIn = null  // 手前の縁取り（濃色・内側）
let reticleFarBack = null
let sharedGeom = null

const _fwd = new THREE.Vector3()

// Square reticle = four corner L-brackets + a diagonal arm at each corner.
function buildReticleGeometry() {
  if (sharedGeom) return sharedGeom
  const v = []
  const seg = (x1, y1, x2, y2) => v.push(x1, y1, 0, x2, y2, 0)
  const H = 0.6   // half-size
  const B = 0.28  // corner bracket arm length (horizontal / vertical)
  const D = 0.3   // diagonal arm length (projected on each axis), inward from corner
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    seg(sx * H, sy * H, sx * H - sx * B, sy * H)          // horizontal arm
    seg(sx * H, sy * H, sx * H, sy * H - sy * B)          // vertical arm
    seg(sx * H, sy * H, sx * H - sx * D, sy * H - sy * D) // diagonal arm toward centre
  }
  sharedGeom = new THREE.BufferGeometry()
  sharedGeom.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return sharedGeom
}

function makeReticle(opacity, color = COLOR, renderOrder = 999) {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false })
  const m = new THREE.LineSegments(buildReticleGeometry(), mat)
  m.renderOrder = renderOrder // always on top
  m.visible = false
  G.rootScene.add(m)
  return m
}

function ensureReticles() {
  // 縁取り（濃色）を先に描き、その上に発光グリーンを重ねる = 白い空でも消えない
  if (!reticleBack) reticleBack = makeReticle(1.0, OUTLINE_COLOR, 998)
  if (!reticleBackIn) reticleBackIn = makeReticle(1.0, OUTLINE_COLOR, 998)
  if (!reticleFarBack) reticleFarBack = makeReticle(0.7, OUTLINE_COLOR, 998)
  if (!reticle) reticle = makeReticle(0.95)
  if (!reticleFar) reticleFar = makeReticle(0.6) // 奥側は少し薄めに
}

// ---- ロックオン枠（今どれを狙っているかを示す。SF64のターゲット枠に相当） ----
const LOCK_COLOR = 0xff5a3c
const LOCK_CONE = 0.86     // 機首方向との一致度（cos）。これ以上ズレた相手は対象外
const LOCK_RANGE = 260     // ロックする最大距離
const LOCK_APPARENT = 0.09 // 画面上の見かけの大きさ（距離に比例させて一定に見せる）

let lockBox = null
const _toT = new THREE.Vector3()

function ensureLockBox() {
  if (lockBox) return
  const mat = new THREE.LineBasicMaterial({ color: LOCK_COLOR, transparent: true, opacity: 0.95, depthTest: false })
  lockBox = new THREE.LineSegments(buildReticleGeometry(), mat)
  lockBox.renderOrder = 1000
  lockBox.visible = false
  G.rootScene.add(lockBox)
}

// 機首の前方コーン内で最も近い相手（敵機＋対戦相手）を選ぶ
function pickLockTarget(shipPos, fwd) {
  let best = null
  let bestDist = LOCK_RANGE
  const consider = (pos) => {
    _toT.copy(pos).sub(shipPos)
    const d = _toT.length()
    if (d < 6 || d > bestDist) return
    if (_toT.divideScalar(d).dot(fwd) < LOCK_CONE) return
    best = pos
    bestDist = d
  }
  for (const e of G.enemies) consider(e.position)
  for (const p of NET.players.values()) {
    if (p.mesh && p.mesh.visible && p.alive) consider(p.mesh.position)
  }
  return best ? { pos: best, dist: bestDist } : null
}

export function updateTargetBox() {
  if (!G.ship || !G.rootScene) return
  ensureReticles()
  ensureLockBox()
  const ship = G.ship
  const camQuat = G.camera ? G.camera.quaternion : null

  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)

  // ロックオン枠: 狙っている相手に赤い枠を出す（距離に比例させて見かけの大きさを一定に）
  const target = pickLockTarget(ship.position, _fwd)
  G.lockTarget = target ? target.pos : null
  if (target) {
    lockBox.visible = true
    lockBox.position.copy(target.pos)
    if (camQuat) lockBox.quaternion.copy(camQuat)
    lockBox.scale.setScalar(Math.max(2.5, target.dist * LOCK_APPARENT))
  } else {
    lockBox.visible = false
  }

  // 手前（標準）: sit straight ahead of the ship, where the laser travels
  reticle.visible = true
  reticle.position.copy(ship.position).addScaledVector(_fwd, AIM_DIST)
  if (camQuat) reticle.quaternion.copy(camQuat) // face the camera
  reticle.scale.set(SIZE, SIZE, SIZE)

  // 奥（小）: same line, further forward — appears small inside the near reticle
  reticleFar.visible = true
  reticleFar.position.copy(ship.position).addScaledVector(_fwd, AIM_DIST_FAR)
  if (camQuat) reticleFar.quaternion.copy(camQuat)
  reticleFar.scale.set(SIZE_FAR, SIZE_FAR, SIZE_FAR)

  // 縁取りは本体と同じ位置・向きで、外側と内側の2重に描く
  const outlines = [
    [reticleBack, reticle, SIZE * OUTLINE_SCALE],
    [reticleBackIn, reticle, SIZE * OUTLINE_SCALE_IN],
    [reticleFarBack, reticleFar, SIZE_FAR * OUTLINE_SCALE],
  ]
  for (const [back, front, size] of outlines) {
    back.visible = true
    back.position.copy(front.position)
    back.quaternion.copy(front.quaternion)
    back.scale.setScalar(size)
  }
}

export function hideTargetBox() {
  for (const m of [reticle, reticleFar, reticleBack, reticleBackIn, reticleFarBack, lockBox]) {
    if (m) m.visible = false
  }
  G.lockTarget = null
}
