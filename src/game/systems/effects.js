// ===========================================================================
// レーザー・ボム・爆発の毎フレーム更新（arwing_react effects.js の移植・全方位対応）。
// 移動は userData.vel（方向×速度）ベース。爆発は多層（コア/外殻/内殻/リング）を
// ease = 1-(1-p)^2.2 で拡大しつつフェード（bombMaxScale 16, duration 2.0）。
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C } from '../config.js'
import { detonateBomb } from './weapons.js'

function removeAt(arr, i, alsoDispose = true) {
  const o = arr[i]
  G.rootScene.remove(o)
  if (alsoDispose) {
    if (o.geometry) o.geometry.dispose()
    if (o.material && o.material !== null && o.material.dispose && o.userData.ownMat) o.material.dispose()
  }
  arr.splice(i, 1)
}

export function updateLasers(dt) {
  for (let i = G.lasers.length - 1; i >= 0; i--) {
    const l = G.lasers[i]
    // 移動前の位置を残す（当たり判定を「点」ではなく「線分」で見るため。
    // 低fpsだと1フレームで6単位以上進み、点判定では敵をすり抜けてしまう）
    l.userData.prevPos.copy(l.position)
    l.position.addScaledVector(l.userData.vel, dt)
    l.userData.life += dt
    if (l.userData.life > C.laserLife) {
      G.rootScene.remove(l)
      G.lasers.splice(i, 1) // geo/matは共有キャッシュなのでdisposeしない
    }
  }
}

export function updateBombs(dt) {
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i]
    b.position.addScaledVector(b.userData.vel, dt)
    b.rotation.x += dt * 4
    b.rotation.y += dt * 3
    b.userData.age += dt
    if (b.userData.age >= C.bombAutoDetonate) {
      detonateBomb(b)
      G.rootScene.remove(b)
      b.geometry.dispose()
      b.material.dispose()
      G.bombs.splice(i, 1)
    }
  }
}

// ---- 多層爆発 ----
// opts で大きさ・時間を指定可能（省略時はボムの既定値）。
//   maxScale: 最大半径, duration: 秒, coreColor: 中心色
export function spawnBlast(pos, opts = {}) {
  if (!G.rootScene) return
  const maxScale = opts.maxScale ?? C.bombMaxScale
  const duration = opts.duration ?? C.bombBlastDuration
  const group = new THREE.Group()
  group.position.copy(pos)

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({
      color: opts.coreColor ?? 0xfff2b0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  const shellOuter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff8c2b, wireframe: true, transparent: true, opacity: 0.7, depthWrite: false,
    }),
  )
  const shellInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffe98a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  group.add(core, shellOuter, shellInner, ring)
  group.userData = {
    age: 0, core, shellOuter, shellInner, ring, maxScale, duration, radius: 0,
    remote: !!opts.remote, // 他プレイヤー由来の爆風（自分の巻き込み判定には使わない）
  }
  G.rootScene.add(group)
  G.blasts.push(group)
}

// 線分（レーザーの移動軌跡）と点（敵の中心）の最短距離。
// すり抜け防止のため、命中判定はこれを使う。
const _ab = new THREE.Vector3()
const _ap = new THREE.Vector3()
export function segmentPointDistance(a, b, p) {
  _ab.copy(b).sub(a)
  const len2 = _ab.lengthSq()
  if (len2 < 1e-9) return a.distanceTo(p)
  _ap.copy(p).sub(a)
  const t = Math.max(0, Math.min(1, _ap.dot(_ab) / len2))
  return _ap.copy(a).addScaledVector(_ab, t).distanceTo(p)
}

// レーザーの軌跡（前フレーム位置→現在位置）と点の距離
export function laserDistanceTo(laser, point) {
  return segmentPointDistance(laser.userData.prevPos, laser.position, point)
}

// 敵撃破・墜落の炎パフ用の小型爆発（見た目はボム爆発の縮小版）
export function explodeSmall(pos, maxScale = 5, duration = 0.7, coreColor = 0xffb36b) {
  spawnBlast(pos, { maxScale, duration, coreColor })
}

export function updateBlasts(dt) {
  for (let i = G.blasts.length - 1; i >= 0; i--) {
    const g = G.blasts[i]
    const u = g.userData
    u.age += dt
    const p = Math.min(1, u.age / u.duration)
    const ease = 1 - Math.pow(1 - p, 2.2)
    const fade = 1 - p
    u.radius = ease * u.maxScale // 敵の巻き込み判定用（enemies.jsが参照）

    // カメラが爆風の中に入ると画面全体が塞がって何も見えなくなるため、
    // 近すぎる爆発はフェードさせる（自分のボムに突っ込んだ時の視界確保）
    let near = 1
    if (G.camera) {
      const d = G.camera.position.distanceTo(g.position)
      const rad = u.radius * C.blastCameraFade
      if (d < rad) near = Math.max(0, d / Math.max(rad, 0.001)) ** 2
    }
    const vis = fade * near

    u.core.scale.setScalar(0.5 + ease * u.maxScale * 0.55)
    u.core.material.opacity = 0.95 * vis
    u.shellOuter.scale.setScalar(0.5 + ease * u.maxScale)
    u.shellOuter.material.opacity = 0.7 * vis
    u.shellInner.scale.setScalar(0.5 + ease * u.maxScale * 0.8)
    u.shellInner.material.opacity = 0.55 * vis
    u.ring.scale.setScalar(0.5 + ease * u.maxScale * 1.25)
    u.ring.material.opacity = 0.9 * vis
    if (G.camera) u.ring.quaternion.copy(G.camera.quaternion) // リングは常にカメラ正対

    if (p >= 1) {
      G.rootScene.remove(g)
      for (const m of [u.core, u.shellOuter, u.shellInner, u.ring]) {
        m.geometry.dispose()
        m.material.dispose()
      }
      G.blasts.splice(i, 1)
    }
  }
}
