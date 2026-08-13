// ===========================================================================
// マルチプレイ対戦の進行（第5フェーズ）。
// - 命中判定は「撃った側」が行う（自分の画面で当たれば当たり = 撃ち味優先）
//   → 当たったら相手へヒット通知 → 相手が自分のシールドを減らす
// - シールド0 → 既存の墜落演出 → 時間マッチ: 3秒で復活（2.5秒無敵）
//                                サバイバル: 脱落して観戦（最後の1人で決着）
// - マッチの開始/終了はホスト（部屋の先頭）が号令、終了判定は各自が壁時計で行う
// ===========================================================================
import * as THREE from 'three'
import { G } from '../state.js'
import { CONFIG as C, MODE, STAGES } from '../config.js'
import { FLIGHT, hitShield } from './flight.js'
import { explodeSmall, spawnBlast, laserDistanceTo } from './effects.js'
import { spawnRemoteLaser, spawnRemoteBomb } from './weapons.js'
import { playSnd, beep } from '../../audio/audio.js'
import { NET, selfId, isOnline, isHost, hostId, colorIndexOf, sortedIds, onRosterChange } from '../../net/net.js'
import { useGameStore } from '../../store/gameStore.js'

const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _camTarget = new THREE.Vector3()
let ended = false          // リザルトへ進んだか（二重終了防止）
let noticeTimer = null

// ---- 名簿をUI（ロビー・順位表）へ反映 ----
export function syncNetPlayers() {
  const store = useGameStore.getState()
  const ids = sortedIds()
  const hid = hostId()
  const players = ids.map((id) => {
    const self = id === selfId
    const p = NET.players.get(id)
    return {
      id,
      self,
      name: self ? NET.myName : (p?.name ?? '…'),
      colorIdx: colorIndexOf(id),
      kills: self ? G.state.kills : (p?.kills ?? 0),
      alive: self ? G.match.alive : (p?.alive ?? true),
      host: hid === id,
    }
  })
  store.setHud({ netPlayers: players, isHost: isHost(), roomCode: NET.roomCode })
}

// ---- 受信ハンドラの取り付け（アプリ起動時に1回だけ） ----
let installed = false
export function installPvp() {
  if (installed) return
  installed = true

  onRosterChange((evt) => {
    syncNetPlayers()
    if (evt && evt.type === 'leave') {
      const store = useGameStore.getState()
      store.setHud({ notice: `${evt.name || '誰か'} が退室しました` })
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => useGameStore.getState().setHud({ notice: '' }), 4000)
    }
  })

  // 他プレイヤーの発射 → 自分の画面で弾を再生（見た目のみ）。
  // 短時間に大量に届いた場合は捨てる（弾で画面が埋まるのを防ぐ）
  NET.onFire = (data, fromId) => {
    const p = NET.players.get(fromId)
    if (!p) return
    const now = performance.now() / 1000
    p.fireTimes = (p.fireTimes || []).filter((t) => now - t < 1)
    if (p.fireTimes.length >= 20) return
    p.fireTimes.push(now)
    if (data && data.t === 'bomb') spawnRemoteBomb(data)
    else spawnRemoteLaser(data)
  }

  // 自分が撃たれた（相手の画面で命中）→ 自分のシールドを減らす。
  // 受け取った値はそのまま使わず、想定範囲に丸める（壊れたメッセージや
  // 古いバージョンの相手からの値で即死・NaNにならないようにする）
  NET.onHit = (data, fromId) => {
    if (!G.match.active || !G.match.alive) return
    if (!NET.players.has(fromId)) return // 部屋にいない相手からのものは無視
    if (G.match.invT > 0 || G.act.mode === MODE.CRASH) return // 無敵・墜落中は無効
    const raw = data && Number(data.dmg)
    const dmg = Number.isFinite(raw)
      ? Math.min(Math.max(raw, 0), C.pvpBombDamage)
      : C.pvpDamage
    G.match.lastAttacker = fromId
    beep(200, 0.15, 'square', 0.2)
    hitShield(dmg)
  }

  // 誰かが撃墜された（本人からの申告）→ 撃った人に+1。
  // 同じ撃墜が連続で届いてもスコアが多重加算されないよう、少しの間は無視する
  NET.onDown = (data, victimId) => {
    const victim = NET.players.get(victimId)
    if (!victim) return
    const now = performance.now() / 1000
    if (now - (victim.lastDownT ?? -99) < 2) return
    victim.lastDownT = now
    if (victim.mesh) spawnBlast(victim.mesh.position, { maxScale: 18, duration: 1.8, remote: true })
    if (G.match.mode === 'survival' && victim) victim.alive = false
    const by = data && typeof data.by === 'string' ? data.by : null
    if (by === selfId) {
      G.state.kills += 1
      G.state.score += C.pvpKillScore
      playSnd('enemy', 0.6, 0.05)
    } else if (by && NET.players.has(by)) {
      NET.players.get(by).kills += 1
    }
    syncNetPlayers()
  }

  // ホストの号令。進行役以外からの号令や、知らないステージ名は無視する
  // （知らないステージ名をそのまま使うとゲーム開始時に落ちるため）
  NET.onMatch = (data, fromId) => {
    if (!data || data.cmd !== 'start') return
    if (fromId !== hostId()) return
    if (!STAGES[data.stage]) return
    if (data.mode !== 'time' && data.mode !== 'survival') return
    startMatchLocal(data)
  }
}

// ---- マッチ開始 ----
export function startMatchAsHost() {
  const store = useGameStore.getState()
  const settings = { cmd: 'start', mode: store.matchMode, stage: store.stage, dur: C.matchTime }
  if (NET.sendMatch) NET.sendMatch(settings)
  startMatchLocal(settings)
}

export function startMatchLocal(settings) {
  // 想定外の値が来ても落ちないよう既定値へ寄せる
  if (!STAGES[settings.stage]) settings = { ...settings, stage: 'grass' }
  if (settings.mode !== 'time' && settings.mode !== 'survival') settings = { ...settings, mode: 'time' }
  const dur = Number(settings.dur)
  if (!Number.isFinite(dur) || dur <= 0) settings = { ...settings, dur: C.matchTime }
  const store = useGameStore.getState()
  store.setHud({ stage: settings.stage, matchMode: settings.mode })
  ended = false

  // ソロと同じ完全リセット（NPC敵なし）— control.startGame は循環参照回避で遅延import
  import('../control.js').then(({ startGame }) => {
    startGame({ npc: false })

    // 参加者を円周上に散らして向かい合わせに配置（開始直後の衝突を防ぐ）
    const ids = sortedIds()
    const idx = Math.max(0, ids.indexOf(selfId))
    const ang = (idx * Math.PI * 2) / Math.max(2, ids.length)
    const r = 350
    const ship = G.ship
    ship.position.set(Math.sin(ang) * r, STAGES[settings.stage].startAltitude, Math.cos(ang) * r)
    FLIGHT.heading = Math.atan2(ship.position.x, ship.position.z) // 中心方向を向く
    ship.quaternion.setFromEuler(_e.set(0, FLIGHT.heading, 0, 'YXZ'))

    // マッチ状態
    G.match.active = true
    G.match.mode = settings.mode
    G.match.endsAt = Date.now() + (settings.dur || C.matchTime) * 1000
    G.match.alive = true
    G.match.invT = 0
    G.match.lastAttacker = null
    G.match.downAnnounced = false
    G.match.maxAlive = 1
    for (const p of NET.players.values()) { p.kills = 0; p.downs = 0; p.alive = true }
    syncNetPlayers()
  })
}

// ---- 生存カウント（stateが届いている＝実際に対戦中の相手だけ数える） ----
function aliveInfo() {
  const now = performance.now() / 1000
  let alive = G.match.alive ? 1 : 0
  for (const p of NET.players.values()) {
    const fresh = p.state && now - p.lastT < C.netStaleTimeout
    if (fresh && p.alive) alive++
  }
  return alive
}

// ---- 自分の復活（時間マッチ） ----
function respawnSelf() {
  const ship = G.ship
  const ang = Math.random() * Math.PI * 2
  const r = 250 + Math.random() * 300
  ship.position.set(Math.sin(ang) * r, G.stageCfg.startAltitude, Math.cos(ang) * r)
  FLIGHT.heading = Math.atan2(ship.position.x, ship.position.z)
  FLIGHT.pitch = 0; FLIGHT.roll = 0; FLIGHT.speed = C.speedNormal
  ship.quaternion.setFromEuler(_e.set(0, FLIGHT.heading, 0, 'YXZ'))
  ship.visible = true
  G.state.shield = G.act.shieldMax  // 金リングで増えていればその値まで回復
  G.act.mode = MODE.NORMAL
  G.crash.t = 0; G.crash.exploded = false; G.crash.overT = 0; G.crash.vy = 0
  G.match.invT = C.invincibleTime
  G.match.downAnnounced = false
  G.match.lastAttacker = null
  playSnd('roll', 0.5)
}

// ---- マッチ終了 → リザルト ----
function endMatch() {
  if (ended) return
  ended = true
  G.match.active = false
  G.state.running = false
  const store = useGameStore.getState()
  const ids = sortedIds()
  const ranking = ids.map((id) => {
    const self = id === selfId
    const p = NET.players.get(id)
    return {
      self,
      name: self ? NET.myName : (p?.name ?? '？'),
      colorIdx: colorIndexOf(id),
      kills: self ? G.state.kills : (p?.kills ?? 0),
      alive: self ? G.match.alive : (p?.alive ?? false),
    }
  })
  let winner
  if (G.match.mode === 'survival') {
    winner = ranking.find((r) => r.alive)?.name ?? '（引き分け）'
    ranking.sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.kills - a.kills)
  } else {
    ranking.sort((a, b) => b.kills - a.kills)
    winner = ranking[0] && ranking[0].kills > 0 ? ranking[0].name : '（引き分け）'
  }
  store.showResult({ ranking, winner, mode: G.match.mode })
}

// ---- 毎フレーム更新（GameTickから呼ぶ） ----
const _blink = { t: 0 }
export function updatePvp(dt) {
  if (!G.match.active || !isOnline()) return
  const ship = G.ship
  const m = G.match

  // 無敵時間: カウントダウンしつつ機体を点滅
  if (m.invT > 0) {
    m.invT -= dt
    _blink.t += dt
    if (G.act.mode !== MODE.CRASH) ship.visible = Math.floor(_blink.t * 8) % 2 === 0
    if (m.invT <= 0) ship.visible = true
  }

  // --- 自分のレーザー vs 他プレイヤー（撃った側が判定） ---
  for (let j = G.lasers.length - 1; j >= 0; j--) {
    const l = G.lasers[j]
    if (l.userData.remote) continue
    for (const [id, p] of NET.players) {
      if (!p.mesh || !p.mesh.visible || !p.alive) continue
      if (laserDistanceTo(l, p.mesh.position) < C.pvpHitRadius) {
        G.rootScene.remove(l)
        G.lasers.splice(j, 1)
        explodeSmall(p.mesh.position, 3.5, 0.5, 0xffe08a)
        playSnd('enemy', 0.25, 0.2)
        G.state.lastHitT = G.state.time // 命中マーク（HUD）
        if (NET.sendHit) NET.sendHit({ dmg: C.pvpDamage }, id)
        break
      }
    }
  }

  // --- 自分のボム爆風 vs 他プレイヤー（1爆風につき1人1回まで） ---
  for (const blast of G.blasts) {
    const u = blast.userData
    if (u.remote || u.radius <= 2) continue
    u.hitIds = u.hitIds || new Set()
    for (const [id, p] of NET.players) {
      if (u.hitIds.has(id) || !p.mesh || !p.mesh.visible || !p.alive) continue
      if (blast.position.distanceTo(p.mesh.position) < u.radius + 3) {
        u.hitIds.add(id)
        if (NET.sendHit) NET.sendHit({ dmg: C.pvpBombDamage }, id)
      }
    }
  }

  // --- 自分の撃墜: 爆発した瞬間に1回だけ申告 ---
  if (G.act.mode === MODE.CRASH && G.crash.exploded && !m.downAnnounced) {
    m.downAnnounced = true
    if (NET.sendDown) NET.sendDown({ by: m.lastAttacker })
    if (m.mode === 'survival') { m.alive = false }
    syncNetPlayers()
  }

  // --- 復活（時間マッチ）/ 観戦カメラ（サバイバル脱落後） ---
  if (G.act.mode === MODE.CRASH && G.crash.exploded) {
    if (m.mode === 'time' && G.crash.overT >= C.respawnTime) respawnSelf()
    if (m.mode === 'survival' && !m.alive && G.camera) {
      // 生きている誰かを後ろから見守る
      for (const p of NET.players.values()) {
        if (!p.mesh || !p.alive || !p.mesh.visible) continue
        _camTarget.copy(p.mesh.position)
        G.camera.position.lerp(_camTarget.clone().add(new THREE.Vector3(0, 8, 20)), Math.min(1, 2 * dt))
        G.camera.lookAt(_camTarget)
        break
      }
    }
  }

  // --- 終了判定（各自が判定。壁時計基準なので全員ほぼ同時） ---
  const alive = aliveInfo()
  m.maxAlive = Math.max(m.maxAlive || 1, alive)
  if (m.mode === 'time') {
    if (Date.now() >= m.endsAt) endMatch()
  } else if (m.maxAlive >= 2 && alive <= 1) {
    endMatch()
  }
}

// ---- HUD用の対戦情報（GameTickが間引き送信で使う） ----
export function matchHudInfo() {
  const m = G.match
  if (!m.active) return { active: false, mode: 'time', left: 0, aliveCount: 0, spectating: false }
  return {
    active: true,
    mode: m.mode,
    left: Math.max(0, Math.ceil((m.endsAt - Date.now()) / 1000)),
    aliveCount: aliveInfo(),
    spectating: m.mode === 'survival' && !m.alive,
    respawnIn: G.act.mode === MODE.CRASH && G.crash.exploded && m.mode === 'time'
      ? Math.max(0, Math.ceil(C.respawnTime - G.crash.overT)) : 0,
  }
}

// レーダー用: 他プレイヤーの位置（機体色つき）
export function radarPlayers() {
  const out = []
  for (const p of NET.players.values()) {
    if (!p.mesh || !p.mesh.visible) continue
    out.push({
      x: p.mesh.position.x / C.fieldRadius,
      z: p.mesh.position.z / C.fieldRadius,
      c: colorIndexOf(p.id),
    })
  }
  return out
}
