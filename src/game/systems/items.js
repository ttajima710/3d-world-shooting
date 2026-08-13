// ===========================================================================
// 強化アイテム（3D_shooting/arwing_react の systems/items.js を全方位向けに移植）。
// 4種類とも元実装と同じ効果・同じ見た目にそろえてある:
//   laser (緑の「L」) … レーザー強化（Lv1→3）
//   bomb  (赤の「B」) … ボム +1
//   silver(銀のリング) … シールド回復
//   gold  (金のリング) … 3個で最大シールドが1.5倍（上限200）
// 元はレール型で「奥から流れてくる」形だったが、こちらは全方位に飛べるため
// 「その場に浮かんで回り、一定時間で消える」形にしている。
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C, MODE } from '../config.js'
import { FLIGHT } from './flight.js'
import { beep } from '../../audio/audio.js'
import { useGameStore } from '../../store/gameStore.js'
import { upgradeLaser, addBomb } from './weapons.js'

// ---- 見た目（arwing_react と同じ作り方: 文字はcanvasで描いてスプライトに貼る） ----
function makeItemTex(label, bg, fg, ring) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const c = cv.getContext('2d')
  // 明るい空の上でも形が分かるよう、外周に濃い縁取りを付ける
  c.fillStyle = '#04140a'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill()
  c.fillStyle = bg; c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.fill()
  c.strokeStyle = ring; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 57, 0, Math.PI * 2); c.stroke()
  // 文字も縁取り付き（白抜きだけだと明るい背景に溶ける）
  c.font = 'bold 68px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.lineWidth = 8; c.strokeStyle = '#04140a'; c.strokeText(label, 64, 68)
  c.fillStyle = fg; c.fillText(label, 64, 68)
  return new THREE.CanvasTexture(cv)
}

const ITEM_TEX = {}
function getItemTex(type) {
  if (!ITEM_TEX[type]) {
    ITEM_TEX[type] = type === 'bomb'
      ? makeItemTex('B', '#e01414', '#ffffff', '#ffd0d0')
      : makeItemTex('L', '#00b84c', '#ffffff', '#c8ffd6')
  }
  return ITEM_TEX[type]
}

// リング（銀/金）のジオメトリ・マテリアルは共有キャッシュ
const ringCache = {}
function ringAssets(type) {
  if (!ringCache[type]) {
    // 「銀」は明るい空だと白い輪が空に溶けて完全に見えなくなる（実測: 180先で線幅2px）。
    // 大きさではなく色の問題なので、空に無い水色にして見つけられるようにする
    const color = type === 'gold' ? 0xffd700 : 0x66ccff
    const emissive = type === 'gold' ? 0xffaa00 : 0x66ddff
    ringCache[type] = {
      geo: new THREE.TorusGeometry(2.6, 0.5, 8, 18),
      mat: new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: 0.9, flatShading: true,
      }),
    }
  }
  return ringCache[type]
}

function makeItemMesh(type) {
  if (type === 'bomb' || type === 'laser') {
    // 加算合成だと明るい空（草原ステージ）で白く飛んで文字が読めなくなるため、
    // 通常合成にして縁取りで浮かせる
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getItemTex(type), transparent: true, depthWrite: false,
    }))
    // 全方位ステージは距離感が掴みにくいので、元実装(3.2)より大きめに出す
    m.scale.setScalar(6.5)
    return m
  }
  const { geo, mat } = ringAssets(type)
  const m = new THREE.Mesh(geo, mat)
  m.scale.setScalar(2.0)
  return m
}

// ---- 出現 ----
const _dir = new THREE.Vector3()
const _pos = new THREE.Vector3()

export function spawnItem(type, pos) {
  if (!G.rootScene) return
  const m = makeItemMesh(type)
  m.position.copy(pos)
  m.userData = { itemType: type, life: 0 }
  G.rootScene.add(m)
  G.items.push(m)
}

// 種類の抽選（元実装の比率を基本に、シールド回復（銀）を少し厚くしている。
// 全方位ステージは撃たれる機会が多く、回復が生存時間の要になるため）
function randomType() {
  const r = Math.random()
  if (r < 0.45) return 'laser'
  if (r < 0.65) return 'bomb'
  if (r < 0.87) return 'silver'
  return 'gold'
}

// 敵を倒した場所に落とす（一定確率）
export function dropItemAt(pos) {
  if (Math.random() > C.itemDropChance) return
  spawnItem(randomType(), pos)
}

// 進行方向の先にふわりと配置する（敵を倒せなくても補給できるように）
function spawnAmbientItem() {
  if (!G.ship) return
  const ang = FLIGHT.heading + (Math.random() - 0.5) * 1.0
  _dir.set(-Math.sin(ang), 0, -Math.cos(ang))
  _pos.copy(G.ship.position).addScaledVector(_dir, C.itemAmbientDist)
  _pos.x += (Math.random() - 0.5) * 60
  _pos.z += (Math.random() - 0.5) * 60
  _pos.y = THREE.MathUtils.clamp(
    G.ship.position.y + (Math.random() - 0.35) * 60,
    G.stageCfg.minAltitude + 15, G.stageCfg.maxAltitude - 15,
  )
  // フィールドの外にはみ出す場合は内側へ引き込む
  const r = Math.hypot(_pos.x, _pos.z)
  const maxR = C.fieldRadius - 40
  if (r > maxR) { _pos.x *= maxR / r; _pos.z *= maxR / r }
  spawnItem(randomType(), _pos)
}

function removeItem(i) {
  const m = G.items[i]
  G.rootScene.remove(m)
  // スプライトのマテリアルは個別生成なので破棄（テクスチャ・リングは共有なので残す）
  if (m.isSprite) m.material.dispose()
  G.items.splice(i, 1)
}

export function resetItems() {
  for (let i = G.items.length - 1; i >= 0; i--) removeItem(i)
  G.state.itemCd = 3
}

// ---- 取得したときの効果（arwing_react の updateRings と同じ内訳） ----
function collect(type) {
  const s = G.state
  const a = G.act
  s.score += C.itemScore
  // 取得音は種類ごとのビープ（元実装の powerup.mp3 はこのプロジェクトに無いため）
  if (type === 'laser') {
    upgradeLaser()
    beep(960, 0.12, 'sine', 0.1); beep(1400, 0.10, 'sine', 0.08)
  } else if (type === 'bomb') {
    addBomb(1)
    beep(300, 0.15, 'sawtooth', 0.10); beep(500, 0.10, 'sine', 0.08)
  } else if (type === 'silver') {
    s.shield = Math.min(a.shieldMax, s.shield + C.itemShieldRepair)
    beep(700, 0.12, 'sine', 0.10); beep(1100, 0.10, 'sine', 0.08)
  } else {
    a.goldCount++
    if (a.goldCount >= C.itemGoldNeeded) {
      a.goldCount = 0
      a.shieldMax = Math.min(C.itemShieldMaxCap, Math.floor(a.shieldMax * C.itemShieldMaxMult))
      s.shield = a.shieldMax
      beep(500, 0.2, 'sine', 0.12); beep(800, 0.15, 'sine', 0.10); beep(1200, 0.12, 'sine', 0.08)
    } else {
      beep(800, 0.15, 'sine', 0.10); beep(1200, 0.12, 'sine', 0.08)
    }
  }
  useGameStore.getState().setHud({
    score: s.score, shield: s.shield, shieldMax: a.shieldMax,
    bombs: a.bombs, laserLv: a.laserLv, gold: a.goldCount,
  })
}

// ---- 毎フレーム更新（GameTick から呼ぶ） ----
export function updateItems(dt) {
  const ship = G.ship
  if (!ship) return
  // 対戦中はアイテムなし（各自の画面にしか出ないため有利不利が生まれてしまう）
  if (G.match.active) { if (G.items.length) resetItems(); return }

  // 補充: フィールドに漂うアイテムが少なければ足す
  G.state.itemCd -= dt
  if (G.state.itemCd <= 0) {
    if (G.items.length < C.itemAmbientMax) spawnAmbientItem()
    G.state.itemCd = C.itemAmbientInterval
  }

  for (let i = G.items.length - 1; i >= 0; i--) {
    const m = G.items[i]
    m.userData.life += dt
    if (!m.isSprite) { m.rotation.z += C.itemSpin * dt; m.rotation.y += C.itemSpin * 0.6 * dt }

    const d = m.position.distanceTo(ship.position)
    if (m.userData.life > C.itemLife || d > C.itemDespawn) {
      removeItem(i)
      continue
    }
    // 近づいたら吸い寄せる。高速で飛んでいると「狙って正確に通る」のはほぼ無理なので、
    // 惜しい距離を通ったら拾えるようにする（原作の取りやすさに寄せる）
    if (G.act.mode !== MODE.CRASH && d < C.itemMagnetRange) {
      m.position.lerp(ship.position, Math.min(1, C.itemMagnetPull * dt))
    }
    // 取得（墜落中は取れない）
    if (G.act.mode !== MODE.CRASH && m.position.distanceTo(ship.position) < C.itemPickupRadius) {
      const type = m.userData.itemType
      removeItem(i)
      collect(type)
    }
  }
}

// 自動テスト（Playwright）から中身を確認するためのフック（devのみ）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__items = {
    list: () => G.items.map((m) => ({ t: m.userData.itemType, p: m.position.toArray().map((v) => Math.round(v)) })),
    spawn: (type, dist = 40) => {
      if (!G.ship) return false
      const p = G.ship.position.clone()
      p.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(G.ship.quaternion), dist)
      spawnItem(type, p)
      return true
    },
  }
}
