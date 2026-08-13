// ===========================================================================
// レーザー / ボム（arwing_react weapons.js の移植・全方位対応）。
// 元実装は -Z 固定方向だったため、機体の前方ベクトルを userData.vel に持たせる
// 形へ一般化。見た目・パラメータは移植元準拠（Lv1レーザーのみ）。
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C } from '../config.js'
import { playSnd, beep } from '../../audio/audio.js'
import { useGameStore } from '../../store/gameStore.js'
import { spawnBlast } from './effects.js'
import { NET, isOnline } from '../../net/net.js'

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _qAlign = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))

// レベルごとのジオメトリ/マテリアルは1回だけ生成してキャッシュ（arwing準拠）
const laserCache = {}
function laserAssets(lv) {
  if (!laserCache[lv]) {
    const cfg = C.laserLevels[lv - 1]
    laserCache[lv] = {
      geo: new THREE.CylinderGeometry(cfg.radius, cfg.radius, 2.4 + (lv - 1) * 0.5, 6),
      mat: new THREE.MeshBasicMaterial({ color: cfg.color }),
    }
  }
  return laserCache[lv]
}

// 現在のレーザーレベル（1〜3）。設定外の値が入っても壊れないよう丸める
export function laserLv() {
  return Math.min(C.laserLvMax, Math.max(1, G.act.laserLv || 1))
}
export function laserLvCfg() { return C.laserLevels[laserLv() - 1] }

// 強化段階による命中半径の上乗せ（enemies.js / pvp.js が参照）
export function laserHitBonus() { return laserLvCfg().hitBonus }

// 現在のレベルでの連射間隔（GameTick / TouchControls が参照）
export function laserCooldown() { return laserLvCfg().cd }

export function fireLaser() {
  const ship = G.ship
  if (!ship || !G.rootScene) return
  const lv = laserLv()
  const cfg = C.laserLevels[lv - 1]
  const { geo, mat } = laserAssets(lv)
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  // 機体ローカルの左右方向（二連射のオフセットに使う）
  _right.set(1, 0, 0).applyQuaternion(ship.quaternion)
  _up.set(0, 1, 0).applyQuaternion(ship.quaternion)

  let first = null
  for (const [ox, oy] of cfg.offsets) {
    const l = new THREE.Mesh(geo, mat)
    // シリンダーはY軸向き → 機体前方に寝かせる
    l.quaternion.copy(ship.quaternion).multiply(_qAlign)
    l.position.copy(ship.position).addScaledVector(_fwd, 2)
      .addScaledVector(_right, ox).addScaledVector(_up, oy)
    l.userData = { life: 0, vel: _fwd.clone().multiplyScalar(C.laserSpeed), remote: false, prevPos: l.position.clone() }
    G.rootScene.add(l)
    G.lasers.push(l)
    if (!first) first = l
  }
  playSnd('laser', 0.3)

  // マルチプレイ: 発射を他プレイヤーの画面でも再生してもらう
  // （見た目だけなので、二連射でも代表1発ぶんだけ送って通信量を抑える）
  if (isOnline() && NET.sendFire && first) {
    const q = ship.quaternion
    NET.sendFire({
      t: 'laser',
      lv,
      p: [+first.position.x.toFixed(1), +first.position.y.toFixed(1), +first.position.z.toFixed(1)],
      q: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)],
    })
  }
}

// ---- 強化アイテムの効果（items.js から呼ぶ。arwing_react の weapons.js と同じ） ----
export function upgradeLaser() {
  G.act.laserLv = Math.min(C.laserLvMax, laserLv() + 1)
  G.act.laserPickups = (G.act.laserPickups || 0) + 1
  useGameStore.getState().setHud({ laserLv: G.act.laserLv })
}

export function addBomb(n) {
  G.act.bombs += n || 1
  useGameStore.getState().setHud({ bombs: G.act.bombs })
}

// 受信データの座標・向きが正しい数値かを確認する（壊れた値を three.js に渡すと
// 画面がNaNで崩れるため、おかしなメッセージは黙って捨てる）
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite)
export function isValidFireData(data) {
  return !!data && isVec(data.p, 3) && isVec(data.q, 4)
}

// 他プレイヤーの弾を自分の画面に出す（見た目のみ。ダメージ判定は撃った側が行う）
const _q = new THREE.Quaternion()
export function spawnRemoteLaser(data) {
  if (!G.rootScene || !isValidFireData(data)) return
  // 相手のレベルは見た目だけに使う（壊れた値は1に丸める）
  const lv = Math.min(C.laserLvMax, Math.max(1, Math.round(Number(data.lv)) || 1))
  const { geo, mat } = laserAssets(lv)
  _q.set(data.q[0], data.q[1], data.q[2], data.q[3])
  _fwd.set(0, 0, -1).applyQuaternion(_q)
  const l = new THREE.Mesh(geo, mat)
  l.quaternion.copy(_q).multiply(_qAlign)
  l.position.set(data.p[0], data.p[1], data.p[2])
  l.userData = { life: 0, vel: _fwd.clone().multiplyScalar(C.laserSpeed), remote: true, prevPos: l.position.clone() }
  G.rootScene.add(l)
  G.lasers.push(l)
  // 近くで撃たれたときだけ小さく音を出す
  if (G.ship && G.ship.position.distanceTo(l.position) < 150) playSnd('laser', 0.12)
}

export function spawnRemoteBomb(data) {
  if (!G.rootScene || !isValidFireData(data)) return
  _q.set(data.q[0], data.q[1], data.q[2], data.q[3])
  _fwd.set(0, 0, -1).applyQuaternion(_q)
  const b = makeBombMesh()
  b.position.set(data.p[0], data.p[1], data.p[2])
  b.userData = { age: 0, vel: _fwd.clone().multiplyScalar(C.bombSpeed), remote: true }
  G.rootScene.add(b)
  G.bombs.push(b)
}

function makeBombMesh() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xffd23f, emissive: 0xff8c2b, emissiveIntensity: 0.9, flatShading: true,
    }),
  )
}

export function launchBomb() {
  const ship = G.ship
  if (!ship || !G.rootScene) return
  if (G.act.bombs <= 0) return
  G.act.bombs -= 1
  useGameStore.getState().setHud({ bombs: G.act.bombs })

  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  const b = makeBombMesh()
  b.position.copy(ship.position).addScaledVector(_fwd, 2.5)
  b.userData = { age: 0, vel: _fwd.clone().multiplyScalar(C.bombSpeed), remote: false }
  G.rootScene.add(b)
  G.bombs.push(b)
  beep(220, 0.18, 'sine', 0.12)

  if (isOnline() && NET.sendFire) {
    const q = ship.quaternion
    NET.sendFire({
      t: 'bomb',
      p: [+b.position.x.toFixed(1), +b.position.y.toFixed(1), +b.position.z.toFixed(1)],
      q: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)],
    })
  }
}

export function detonateBomb(b) {
  // remote印を爆風にも引き継ぐ（相手のボムの爆風は自分の判定に使わない）
  spawnBlast(b.position, { remote: !!(b.userData && b.userData.remote) })
  playSnd('bomb', 0.6)
}

// 飛行中のボムがあれば即起爆して true（＝ボタン再押しで手動起爆。arwing準拠）
export function triggerBombDetonations() {
  if (G.bombs.length === 0) return false
  for (const b of G.bombs) {
    detonateBomb(b)
    G.rootScene.remove(b)
    b.geometry.dispose()
    b.material.dispose()
  }
  G.bombs.length = 0
  return true
}
