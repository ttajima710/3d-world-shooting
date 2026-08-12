// ===========================================================================
// 水平維持チェイスカメラ（酔い対策・第2フェーズ）。
// - up は常にワールド上方向。機体のロール/ピッチにカメラは追従しない
//   → 左右移動やバレルロールで地平線が傾かない
// - 後方位置は機体の「方位（ヨー）」だけから算出
// - 宙返り(LOOPING)/インメルマン(UTURN)中はカメラを定点に留め、
//   lookAtだけで機体を追う（SF64のループ演出: 目の前で機体が弧を描く）。
//   UTURNのロールアウト以降は新方位の後方へゆっくり回り込む
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C, MODE } from '../config.js'
import { FLIGHT } from './flight.js'

const _desired = new THREE.Vector3()
const _look = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const _anchor = new THREE.Vector3()

let camBackCur = C.camBack
let prevMode = MODE.NORMAL

export function updateCamera(dt) {
  const cam = G.camera
  const ship = G.ship
  if (!cam || !ship) return
  const mode = G.act.mode
  // 墜落(CRASH)も演出カメラ: 定点に留まりlookAtだけで機体を見送る（酔わない・ドラマチック）
  const maneuver = mode === MODE.LOOPING || mode === MODE.UTURN || mode === MODE.CRASH

  if (maneuver) {
    // 演出開始時点のカメラ位置を記録（ここに留まり機体を見送る）
    const wasManeuver = prevMode === MODE.LOOPING || prevMode === MODE.UTURN || prevMode === MODE.CRASH
    if (!wasManeuver) _anchor.copy(cam.position)

    if (mode === MODE.UTURN && FLIGHT.ut.phase !== 'A') {
      // ロールアウト以降: 新方位の後方へゆっくり回り込む（引き気味で迫力を出す）
      camBackCur += (C.camBackUturn - camBackCur) * Math.min(1, 2 * dt)
      _desired.set(Math.sin(FLIGHT.heading), 0, Math.cos(FLIGHT.heading))
        .multiplyScalar(camBackCur)
        .add(ship.position)
      _desired.y += C.camUp
      cam.position.lerp(_desired, Math.min(1, 2.2 * dt))
    } else {
      // 半ループ/宙返り中: 定点からlookAtのみ（カメラ自身は回転運動しない＝酔わない）
      cam.position.lerp(_anchor, Math.min(1, 2 * dt))
    }
    cam.up.lerp(WORLD_UP, Math.min(1, 8 * dt)).normalize()
    cam.lookAt(ship.position)
    prevMode = mode
    return
  }

  // ---- 通常チェイス（水平維持） ----
  const backTarget = G.state.boost ? C.camBackBoost : C.camBack
  camBackCur += (backTarget - camBackCur) * Math.min(1, C.camLerp * dt)

  // 後方オフセットは方位のみから（ピッチ・ロール非追従）
  _desired.set(Math.sin(FLIGHT.heading), 0, Math.cos(FLIGHT.heading))
    .multiplyScalar(camBackCur)
    .add(ship.position)
  _desired.y += C.camUp
  cam.position.lerp(_desired, Math.min(1, C.camLerp * dt))
  cam.up.lerp(WORLD_UP, Math.min(1, C.camLerp * dt)).normalize()

  // 機体の少し前方を見る（ピッチに応じて注視点だけ上下し、傾かずに上下方向の情報を伝える）
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  _look.copy(ship.position).addScaledVector(_fwd, C.lookAhead)
  cam.lookAt(_look)
  prevMode = mode
}
