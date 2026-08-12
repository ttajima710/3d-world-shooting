// ===========================================================================
// 敵機システム（第4フェーズ）。
// - enemy1: ランダム方位へまっすぐ飛ぶ（境界で内側へ向き直す）
// - enemy2: ゆるやかに蛇行（方位と高度がsin波で揺れる）。プレイヤーが近いと逃げる
// - 出現: プレイヤーの視界の奥（enemySpawnDist）から自然に現れ、常時 enemyMax まで補充
// - 当たり判定は距離ベースで広め（快適さ優先）: レーザー/ボム爆風/体当たり
// - モデルは arwing 方式: バウンディング球半径1に正規化 → タイプ別スケール
// ===========================================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { G } from '../state.js'
import { CONFIG as C, MODE } from '../config.js'
import { FLIGHT, hitShield } from './flight.js'
import { explodeSmall, laserDistanceTo, segmentPointDistance } from './effects.js'
import { playSnd, beep } from '../../audio/audio.js'

const ENEMY = {
  1: { url: './models/enemy1.glb', scale: C.enemy1Scale, speed: C.enemy1Speed, hitR: C.enemyHitRadius1, score: C.enemyScore1, color: 0xff8c2b },
  2: { url: './models/enemy2.glb', scale: C.enemy2Scale, speed: C.enemy2Speed, hitR: C.enemyHitRadius2, score: C.enemyScore2, color: 0xff3b6b },
}

// ---- モデルテンプレート（起動時に一度だけロード。失敗時は多面体フォールバック） ----
const templates = { 1: null, 2: null }
// GLBはmeshopt圧縮済み（drei の useGLTF は自動で復号するが、
// 自前の GLTFLoader には復号器を明示的に渡す必要がある）
const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
for (const type of [1, 2]) {
  loader.load(ENEMY[type].url, (gltf) => {
    let mesh = null
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((c) => { if (c.isMesh && !mesh) mesh = c })
    if (!mesh) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)     // GLB内部の変換を焼き込む
    geo.computeBoundingSphere()
    const bs = geo.boundingSphere
    geo.translate(-bs.center.x, -bs.center.y, -bs.center.z) // 中心を原点へ
    geo.scale(1 / bs.radius, 1 / bs.radius, 1 / bs.radius)  // 半径1に正規化
    const mat = mesh.material.clone()
    mat.metalness = 0.2
    mat.roughness = 0.7
    templates[type] = { geo, mat }
  }, undefined, () => { /* フォールバックを使う */ })
}

function makeEnemyMesh(type) {
  const t = templates[type]
  let mesh
  if (t) {
    mesh = new THREE.Mesh(t.geo, t.mat)
  } else {
    // ロード前/失敗時の代替（arwing factory と同じ発想）
    mesh = new THREE.Mesh(
      type === 1 ? new THREE.OctahedronGeometry(1) : new THREE.TetrahedronGeometry(1.2),
      new THREE.MeshStandardMaterial({ color: ENEMY[type].color, emissive: ENEMY[type].color, emissiveIntensity: 0.4 }),
    )
  }
  mesh.scale.setScalar(ENEMY[type].scale)
  mesh.rotation.y = C.enemyFaceY // 機首向き補正
  const holder = new THREE.Group()
  holder.add(mesh)
  return holder
}

// ---- 出現 ----
const _dir = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

// 角度差を -π..π に正規化（flight.js と同じ考え方）
function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function altRange() {
  const pad = 20
  return [G.stageCfg.minAltitude + pad, G.stageCfg.maxAltitude - pad]
}

// プレイヤーの進行方向±70°の奥（=画面の端の先）に出現させる
function spawnEnemy(distOverride) {
  if (!G.ship || !G.rootScene) return
  const type = Math.random() < 0.6 ? 1 : 2
  const ang = FLIGHT.heading + (Math.random() - 0.5) * C.enemySpawnSpread
  const dist = distOverride ?? C.enemySpawnDist
  _dir.set(-Math.sin(ang), 0, -Math.cos(ang))
  _tmp.copy(G.ship.position).addScaledVector(_dir, dist)

  const [lo, hi] = altRange()
  _tmp.y = THREE.MathUtils.clamp(G.ship.position.y + (Math.random() * 100 - 40), lo, hi)

  // フィールドの外にはみ出す場合は内側へ引き込む
  const r = Math.hypot(_tmp.x, _tmp.z)
  const maxR = C.fieldRadius - 40
  if (r > maxR) { _tmp.x *= maxR / r; _tmp.z *= maxR / r }
  if (_tmp.distanceTo(G.ship.position) < C.enemyRespawnClear) return // 近すぎたら今回は見送り

  const e = makeEnemyMesh(type)
  e.position.copy(_tmp)
  e.userData = {
    type,
    speed: ENEMY[type].speed,
    // enemy1: フィールドを横切る方位 / enemy2: 蛇行の基準方位
    heading: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    bank: 0,
    fireCd: C.enemyFireCdMin + Math.random() * (C.enemyFireCdMax - C.enemyFireCdMin),
  }
  G.rootScene.add(e)
  G.enemies.push(e)
}

function removeEnemy(i) {
  G.rootScene.remove(G.enemies[i])
  G.enemies.splice(i, 1)
}

function killEnemy(i, byPlayer = true) {
  const e = G.enemies[i]
  explodeSmall(e.position, 6, 0.8, ENEMY[e.userData.type].color)
  if (byPlayer) {
    G.state.score += ENEMY[e.userData.type].score
    G.state.kills += 1
    G.state.lastHitT = G.state.time // 命中マーク（HUD）
    playSnd('enemy', 0.5, 0.1)
  }
  removeEnemy(i)
}

// ---- 全消しのみ（マルチ対戦 = NPCなしで使う） ----
export function clearEnemies() {
  for (let i = G.enemies.length - 1; i >= 0; i--) removeEnemy(i)
  for (const s of G.enemyShots) G.rootScene.remove(s)
  G.enemyShots.length = 0
}

// ---- 敵の攻撃弾（赤いレーザー）。原作のように敵も撃ち返してくる ----
let shotGeo = null
let shotMat = null
const _aim = new THREE.Vector3()
const _look = new THREE.Vector3()

function fireEnemyShot(e) {
  if (!G.rootScene || !G.ship) return
  if (!shotGeo) {
    // 見落とさないよう太く長く（原作の敵弾に近い存在感）。
    // ベタ塗りだと至近距離で「赤い板」に見えるため、加算合成で光の弾に見せる
    shotGeo = new THREE.CylinderGeometry(0.22, 0.22, 5, 6)
    shotMat = new THREE.MeshBasicMaterial({
      color: 0xff6a5a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  }
  // 偏差撃ち: プレイヤーの「今いる場所」ではなく「弾が届く頃にいる場所」を狙う。
  // 直撃狙いだと弾速90に対し自機が動くため、ほぼ当たらない。
  const dist = e.position.distanceTo(G.ship.position)
  const travel = dist / C.enemyShotSpeed
  _look.set(0, 0, -1).applyQuaternion(G.ship.quaternion).multiplyScalar(FLIGHT.speed * travel)
  _aim.copy(G.ship.position).add(_look)
  // 着弾点で一定のブレを与える（距離が遠いほど角度は小さくなる＝理不尽さ防止）
  _aim.x += (Math.random() - 0.5) * C.enemyShotMiss * 2
  _aim.y += (Math.random() - 0.5) * C.enemyShotMiss * 2
  _aim.z += (Math.random() - 0.5) * C.enemyShotMiss * 2
  _aim.sub(e.position).normalize()

  const s = new THREE.Mesh(shotGeo, shotMat)
  s.position.copy(e.position).addScaledVector(_aim, 3)
  // シリンダーはY軸向きなので、進行方向を向かせてから寝かせる
  s.lookAt(_look.copy(s.position).add(_aim))
  s.rotateX(Math.PI / 2)
  s.userData = { vel: _aim.clone().multiplyScalar(C.enemyShotSpeed), life: 0, prevPos: s.position.clone() }
  G.rootScene.add(s)
  G.enemyShots.push(s)
  beep(720, 0.06, 'square', 0.06)
}

function updateEnemyShots(dt) {
  const ship = G.ship
  for (let i = G.enemyShots.length - 1; i >= 0; i--) {
    const s = G.enemyShots[i]
    s.userData.prevPos.copy(s.position)
    s.position.addScaledVector(s.userData.vel, dt)
    s.userData.life += dt

    // プレイヤーに命中（線分判定。墜落中・無敵中は無効）
    const invincible = G.match.active && G.match.invT > 0
    if (!invincible && G.act.mode !== MODE.CRASH &&
        segmentPointDistance(s.userData.prevPos, s.position, ship.position) < C.playerHitRadius) {
      explodeSmall(s.position, 2.2, 0.4, 0xff6b6b)
      // 被弾方向を記録（HUDの被弾インジケータ用）
      G.state.lastDamageT = G.state.time
      _aim.copy(s.userData.prevPos).sub(ship.position).normalize()
      G.state.damageFrom.x = _aim.x
      G.state.damageFrom.y = _aim.y
      G.state.damageFrom.z = _aim.z
      hitShield(C.damageEnemyShot)
      G.rootScene.remove(s)
      G.enemyShots.splice(i, 1)
      continue
    }
    if (s.userData.life > C.enemyShotLife) {
      G.rootScene.remove(s)
      G.enemyShots.splice(i, 1)
    }
  }
}

// ---- 全体リセット（startGameから呼ぶ） ----
export function resetEnemies() {
  clearEnemies()
  G.state.enemyCd = 1.0
  // 開始直後、前方に数機だけ先に置いておく（すぐ遊びが始まるように）
  for (let n = 0; n < C.enemyInitial; n++) spawnEnemy(250 + n * 60)
}

// ---- 毎フレーム更新（GameTickから呼ぶ） ----
export function updateEnemies(dt) {
  const ship = G.ship
  if (!ship) return
  if (G.match.active) return // マルチ対戦中はNPC敵機なし（startMatchで既に空）
  updateEnemyShots(dt)
  const t = G.state.time

  // 補充: 一定間隔で視界の奥から自然に湧く
  G.state.enemyCd -= dt
  if (G.state.enemyCd <= 0 && G.enemies.length < C.enemyMax) {
    spawnEnemy()
    G.state.enemyCd = C.enemySpawnMin + Math.random() * (C.enemySpawnMax - C.enemySpawnMin)
  }

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i]
    const u = e.userData

    // --- 移動 ---
    if (u.type === 1) {
      // 基本はまっすぐ。ただし遠く離れたらプレイヤーの方へ緩く向き直る
      // （放っておくと画面外に行きっぱなしで「敵を探す時間」が増えるため）
      const dp = e.position.distanceTo(ship.position)
      if (dp > C.enemyEngageRange) {
        const toP = Math.atan2(-(ship.position.x - e.position.x), -(ship.position.z - e.position.z))
        u.heading += angDiff(u.heading, toP) * Math.min(1, C.enemyTurnRate * 0.5 * dt)
        e.position.y += THREE.MathUtils.clamp(ship.position.y - e.position.y, -10, 10) * 0.25 * dt
      }
      if (Math.hypot(e.position.x, e.position.z) > C.fieldRadius - 30) {
        u.heading = Math.atan2(e.position.x, e.position.z) + (Math.random() - 0.5) * 0.8
      }
    } else {
      // 蛇行しながらプレイヤーへ絡む（原作の敵機のように向かってきてすれ違う）
      u.heading += Math.sin(t * 0.5 + u.phase) * 0.5 * dt
      const dp = e.position.distanceTo(ship.position)
      if (dp > C.enemyBreakRange) {
        // プレイヤーの方へ向き直る（近すぎる時は曲がらずそのまま抜ける）
        const toP = Math.atan2(-(ship.position.x - e.position.x), -(ship.position.z - e.position.z))
        u.heading += angDiff(u.heading, toP) * Math.min(1, C.enemyTurnRate * dt)
        // 高度も合わせにいく（上下に外れたままにならないように）
        e.position.y += THREE.MathUtils.clamp(ship.position.y - e.position.y, -14, 14) * 0.35 * dt
      }
      e.position.y += Math.sin(t * 0.8 + u.phase) * 5 * dt
      if (Math.hypot(e.position.x, e.position.z) > C.fieldRadius - 30) {
        u.heading = Math.atan2(e.position.x, e.position.z)
      }
      const [lo, hi] = altRange()
      e.position.y = THREE.MathUtils.clamp(e.position.y, lo, hi)
    }
    _dir.set(-Math.sin(u.heading), 0, -Math.cos(u.heading))
    e.position.addScaledVector(_dir, u.speed * dt)

    // 機首を進行方向へ（旋回時は軽くバンク）
    const turn = u.type === 2 ? Math.sin(t * 0.5 + u.phase) : 0
    u.bank += (turn * 0.5 - u.bank) * Math.min(1, 4 * dt)
    e.quaternion.setFromEuler(_e.set(0, u.heading, u.bank, 'YXZ'))

    // --- 攻撃: 射程内かつ機首がこちらを向いていたら撃ってくる ---
    u.fireCd -= dt
    if (u.fireCd <= 0) {
      const dToP = e.position.distanceTo(ship.position)
      if (dToP < C.enemyFireRange && G.act.mode !== MODE.CRASH) {
        _dir.set(-Math.sin(u.heading), 0, -Math.cos(u.heading))
        _tmp.copy(ship.position).sub(e.position).normalize()
        if (_dir.dot(_tmp) > C.enemyFireAim) fireEnemyShot(e)
      }
      u.fireCd = C.enemyFireCdMin + Math.random() * (C.enemyFireCdMax - C.enemyFireCdMin)
    }

    // --- 遠すぎたら静かに消す（近くに湧き直させる） ---
    if (e.position.distanceTo(ship.position) > C.enemyDespawn) {
      removeEnemy(i)
      continue
    }

    const hitR = ENEMY[u.type].hitR

    // --- レーザー命中（広め判定・即撃破）。他プレイヤーの弾は見た目だけなので除外 ---
    // 判定は「前フレーム位置→現在位置」の線分と敵中心の距離（低fpsでのすり抜け防止）
    let dead = false
    for (let j = G.lasers.length - 1; j >= 0; j--) {
      if (G.lasers[j].userData.remote) continue
      if (laserDistanceTo(G.lasers[j], e.position) < hitR) {
        G.rootScene.remove(G.lasers[j])
        G.lasers.splice(j, 1)
        killEnemy(i)
        dead = true
        break
      }
    }
    if (dead) continue

    // --- ボム爆風に巻き込まれたら撃破（他プレイヤーの爆風は除外） ---
    for (const blast of G.blasts) {
      if (blast.userData.remote) continue
      if (blast.userData.radius > 2 && blast.position.distanceTo(e.position) < blast.userData.radius + hitR * 0.5) {
        killEnemy(i)
        dead = true
        break
      }
    }
    if (dead) continue

    // --- プレイヤーへの体当たり（墜落中は判定しない） ---
    if (G.act.mode !== MODE.CRASH && e.position.distanceTo(ship.position) < C.enemyBodyRadius) {
      killEnemy(i, false) // 敵も爆発するがスコアにはしない
      beep(120, 0.25, 'sawtooth', 0.25)
      hitShield(C.damageEnemyContact)
    }
  }
}
