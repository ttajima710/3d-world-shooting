// ===========================================================================
// 中央フレームループ（useFrame の唯一の呼び出し元）。
// 飛行→カメラ→太陽光→エンジン光→レーザー連射→弾/爆発→照準→HUD/レーダー間引き送信。
// pause中は全シミュレーション凍結（arwing準拠）。
// ===========================================================================
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { G } from './state.js'
import { CONFIG as C, MODE } from './config.js'
import { FLIGHT, updateFlight } from './systems/flight.js'
import { updateCamera } from './systems/camera.js'
import { fireLaser } from './systems/weapons.js'
import { updateLasers, updateBombs, updateBlasts } from './systems/effects.js'
import { updateEnemies } from './systems/enemies.js'
import { updateTargetBox, hideTargetBox } from './systems/targeting.js'
import { NET, isOnline, leaveNetRoom, colorIndexOf } from '../net/net.js'
import { installPvp, updatePvp, matchHudInfo, radarPlayers } from './systems/pvp.js'
import { useGameStore } from '../store/gameStore.js'

const SUN_OFFSET = { x: 250, y: 400, z: 150 }

// 画面外にいる相手を画面端の矢印で知らせるためのデータを作る（最大6件）。
// 画面内の相手はロックオン枠と機体そのものが見えるので対象外。
const _proj = new THREE.Vector3()
// 被弾方向を「自機の向きから見た角度」に直す（0=正面、π/2=右、-π/2=左、±π=真後ろ）
function damageAngle() {
  const d = G.state.damageFrom
  const h = FLIGHT.heading
  // 自機前方 (-sin h, -cos h) を基準に、水平面での相対角を求める
  const fx = -Math.sin(h), fz = -Math.cos(h)
  const rx = Math.cos(h), rz = -Math.sin(h) // 右方向
  return Math.atan2(d.x * rx + d.z * rz, d.x * fx + d.z * fz)
}

function collectOffscreenMarkers(camera) {
  const out = []
  const add = (pos, c) => {
    if (out.length >= 6) return
    _proj.copy(pos).project(camera)
    const behind = _proj.z > 1
    const onScreen = !behind && Math.abs(_proj.x) <= 0.95 && Math.abs(_proj.y) <= 0.95
    if (onScreen) return
    // 後方の相手は投影が反転するため符号を戻す
    out.push({ x: behind ? -_proj.x : _proj.x, y: behind ? -_proj.y : _proj.y, b: behind, c })
  }
  for (const e of G.enemies) add(e.position, -1) // -1 = NPCの敵（赤）
  for (const p of NET.players.values()) {
    if (p.mesh && p.mesh.visible && p.alive) add(p.mesh.position, colorIndexOf(p.id))
  }
  return out
}

export default function GameTick() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const hudAcc = useRef(0)
  const netAcc = useRef(0)

  useEffect(() => {
    G.camera = camera
    G.rootScene = scene
    installPvp() // マルチ対戦の受信ハンドラ（初回のみ）
  }, [camera, scene])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const ship = G.ship
    if (!ship) return
    const store = useGameStore.getState()

    // タイトル画面: 機体の周りをゆっくり回るショーケースカメラ
    if (store.screen !== 'playing') {
      G.state.time += dt
      const t = G.state.time * 0.15
      const r = 14
      camera.position.set(
        ship.position.x + Math.sin(t) * r,
        ship.position.y + 4,
        ship.position.z + Math.cos(t) * r,
      )
      camera.up.set(0, 1, 0)
      camera.lookAt(ship.position)
      hideTargetBox()
      return
    }

    // ESCでタイトルへ戻る（escPressed = input.jsでラッチされた押下）
    if (G.keys['Escape'] || G.escPressed) {
      G.keys['Escape'] = false
      G.escPressed = false
      G.state.running = false
      if (isOnline()) { leaveNetRoom(); G.match.active = false } // 対戦中なら部屋も退室
      store.showStart()
      hideTargetBox()
      return
    }

    // ポーズ中は全て凍結
    if (store.paused) return

    G.state.time += dt
    updateFlight(dt)
    updateCamera(dt)

    // ブースト時は視野角を広げてスピード感を出す（快適化）
    const targetFov = G.state.boost ? C.fovBoost : C.fovBase
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, C.fovLerp * dt)
      camera.updateProjectionMatrix()
    }

    // 太陽光を機体に追従（どこでも影が出る）
    if (G.sunLight && G.sunTarget) {
      G.sunLight.position.set(
        ship.position.x + SUN_OFFSET.x,
        ship.position.y + SUN_OFFSET.y,
        ship.position.z + SUN_OFFSET.z,
      )
      G.sunTarget.position.copy(ship.position)
      G.sunTarget.updateMatrixWorld()
    }

    // エンジングローの脈動
    const pulse = 1 + Math.sin(G.state.time * 24) * 0.12
    const s = (G.state.boost ? 1.55 : 1.0) * pulse
    for (const glow of G.engineGlows) glow.scale.setScalar(s)

    // レーザー連射（Space / J / クリック / LASERボタン。宙返り・帰還・墜落中は不可）
    G.state.fireCd -= dt
    const canFire = G.act.mode !== MODE.LOOPING && G.act.mode !== MODE.UTURN && G.act.mode !== MODE.CRASH
    if (canFire && (G.keys['Space'] || G.keys['KeyJ'] || G.shootHeld) && G.state.fireCd <= 0) {
      fireLaser()
      G.state.fireCd = C.fireCooldown
    }

    updateLasers(dt)
    updateBombs(dt)
    updateBlasts(dt)
    updateEnemies(dt)
    updatePvp(dt)
    updateTargetBox()

    // マルチプレイ: 自機の位置と向きを間引き送信（他の人の画面に映る）
    if (isOnline() && NET.sendState) {
      netAcc.current += dt
      if (netAcc.current > 1 / C.netSendRate) {
        netAcc.current = 0
        const q = ship.quaternion
        NET.sendState({
          p: [+ship.position.x.toFixed(1), +ship.position.y.toFixed(1), +ship.position.z.toFixed(1)],
          q: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)],
          b: G.state.boost,
          vis: ship.visible, // 墜落爆発後は非表示を相手にも伝える
        })
      }
    }

    // HUD/レーダーへ約8回/秒だけ送る
    hudAcc.current += dt
    if (hudAcc.current > C.hudSyncInterval) {
      hudAcc.current = 0
      const dist = ship.position.length()
      const online = isOnline()
      const payload = {
        score: G.state.score,
        bombs: G.act.bombs,
        shield: Math.round(G.state.shield),
        kills: G.state.kills,
        // 衝突直後だけ true → HUDの赤フラッシュ（快適化: ぶつかったことを分かりやすく）
        flash: G.state.time - (G.state.lastBounceT ?? -99) < C.bounceFlashDuration,
        // 命中した直後だけ true → 画面中央に命中マーク（手応えの可視化）
        hitMark: G.state.time - (G.state.lastHitT ?? -99) < 0.25,
        // 画面外の相手を指す矢印
        markers: collectOffscreenMarkers(camera),
        // 被弾方向（自機の向きを基準にした角度。0=正面、+が右）
        damage: G.state.time - (G.state.lastDamageT ?? -99) < C.damageFlashDuration
          ? damageAngle() : null,
        match: matchHudInfo(),
        radar: {
          rx: ship.position.x / C.fieldRadius,
          rz: ship.position.z / C.fieldRadius,
          hd: FLIGHT.heading,
          out: dist > C.fieldRadius * 0.999 || G.act.mode === MODE.UTURN,
          alt: ship.position.y, // 高度メーター用
          // 敵の位置（レーダーの赤点。最大10機まで）
          enemies: G.enemies.slice(0, 10).map((e) => ({
            x: e.position.x / C.fieldRadius,
            z: e.position.z / C.fieldRadius,
          })),
          // 他プレイヤーの位置（機体色の点）
          players: online ? radarPlayers() : [],
        },
      }
      // 対戦中は順位表の撃墜数も更新（名簿の名前・色はロスター変更時に反映済み）
      if (online && G.match.active) {
        payload.netPlayers = store.netPlayers.map((p) => ({
          ...p,
          kills: p.self ? G.state.kills : (NET.players.get(p.id)?.kills ?? p.kills),
          alive: p.self ? G.match.alive : (NET.players.get(p.id)?.alive ?? p.alive),
        }))
      }
      store.setHud(payload)
    }
  })
  return null
}
