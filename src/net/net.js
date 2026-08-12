// ===========================================================================
// マルチプレイ通信コア（trystero = WebRTC メッシュ、サーバー不要）。
// 部屋への参加/退出、参加者名簿、5種のメッセージ（状態/発射/ヒット/撃墜/マッチ進行）。
// 60fpsで動く値（他機の位置など）は NET.players に持ち、UI用の名簿だけを
// gameStore へ間引き反映する（G と store の分離方針と同じ）。
// ===========================================================================
import { joinRoom, selfId } from 'trystero'
import { CONFIG as C } from '../game/config.js'

export { selfId }

export const NET = {
  room: null,          // trystero の部屋オブジェクト（null = ソロプレイ中）
  roomCode: '',
  myName: 'プレイヤー',
  myCreator: false,    // 自分がこの部屋を作った人か（進行役の決定に使う）
  // peerId → { name, joinT, state:{p,q,b,md,t}, lastT, kills, downs, alive, mesh }
  players: new Map(),
  // 送信関数（joinで設定）
  sendState: null,
  sendFire: null,
  sendHit: null,
  sendDown: null,
  sendMatch: null,
  // 受信コールバック（pvp / control が登録）
  onFire: null,
  onHit: null,
  onDown: null,
  onMatch: null,
}

// 名簿変更（入退室・名前判明）の購読 — 複数のUI部品が同時に使うためリスナー集合
const rosterListeners = new Set()
export function onRosterChange(fn) {
  rosterListeners.add(fn)
  return () => rosterListeners.delete(fn)
}

// 自分も含めた並び順（peerIdの辞書順）— 全員が同じ計算になるので
// 機体色の割り当てなどに使う
export function sortedIds() {
  return [selfId, ...NET.players.keys()].sort()
}

export function colorIndexOf(id) {
  return sortedIds().indexOf(id) % C.playerColors.length
}

// 進行役（ホスト）= 部屋を作った人。抜けたら並び順の先頭が自動で繰り上がる
export function hostId() {
  const all = [
    { id: selfId, cr: NET.myCreator },
    ...[...NET.players.values()].map((p) => ({ id: p.id, cr: !!p.creator })),
  ].sort((a, b) => (a.id < b.id ? -1 : 1))
  const creators = all.filter((x) => x.cr)
  return (creators.length ? creators : all)[0].id
}

export function isHost() {
  return hostId() === selfId
}

function notifyRoster(evt = null) {
  for (const fn of rosterListeners) fn(evt)
}

// 部屋コード生成（読み間違えにくい文字だけの4文字）
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeRoomCode() {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]
  return s
}

export function joinNetRoom(roomCode, name, creator = false) {
  if (NET.room) leaveNetRoom()
  NET.roomCode = roomCode
  NET.myName = name || 'プレイヤー'
  NET.myCreator = creator
  NET.room = joinRoom({ appId: C.netAppId }, roomCode)

  // trystero v0.25: makeAction は {send, onMessage} を返す（旧版のタプルではない）
  const room = NET.room
  const actMeta = room.makeAction('meta')   // 名前の自己紹介
  const actState = room.makeAction('state') // 自機の位置と向き
  const actFire = room.makeAction('fire')   // レーザー/ボム発射
  const actHit = room.makeAction('hit')     // 命中通知（相手指定）
  const actDown = room.makeAction('down')   // 撃墜されたよ通知
  const actMatch = room.makeAction('match') // ホストの進行号令
  NET.sendState = (d) => actState.send(d).catch(() => {})
  NET.sendFire = (d) => actFire.send(d).catch(() => {})
  NET.sendHit = (d, id) => actHit.send(d, { target: id }).catch(() => {})
  NET.sendDown = (d) => actDown.send(d).catch(() => {})
  NET.sendMatch = (d) => actMatch.send(d).catch(() => {})

  const ensurePlayer = (id) => {
    if (!NET.players.has(id)) {
      NET.players.set(id, {
        id, name: '…', joinT: Date.now(), creator: false,
        state: null, lastT: 0,
        kills: 0, downs: 0, alive: true, mesh: null,
      })
    }
    return NET.players.get(id)
  }

  room.onPeerJoin = (id) => {
    ensurePlayer(id)
    actMeta.send({ name: NET.myName, creator: NET.myCreator }, { target: id }).catch(() => {}) // 新入りに自己紹介
    notifyRoster()
  }
  room.onPeerLeave = (id) => {
    const p = NET.players.get(id)
    if (p && p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh)
    NET.players.delete(id)
    notifyRoster({ type: 'leave', name: p ? p.name : '' })
  }
  actMeta.onMessage = (data, { peerId: id }) => {
    const p = ensurePlayer(id)
    p.name = data.name || '？'
    p.creator = !!data.creator
    notifyRoster()
  }
  actState.onMessage = (data, { peerId: id }) => {
    const p = ensurePlayer(id)
    p.state = data
    p.lastT = performance.now() / 1000
  }
  actFire.onMessage = (data, { peerId: id }) => { if (NET.onFire) NET.onFire(data, id) }
  actHit.onMessage = (data, { peerId: id }) => { if (NET.onHit) NET.onHit(data, id) }
  actDown.onMessage = (data, { peerId: id }) => {
    const p = NET.players.get(id)
    if (p) p.downs++
    if (NET.onDown) NET.onDown(data, id)
  }
  actMatch.onMessage = (data, { peerId: id }) => { if (NET.onMatch) NET.onMatch(data, id) }

  actMeta.send({ name: NET.myName, creator: NET.myCreator }).catch(() => {}) // すでにいる人にも自己紹介
  notifyRoster()
  return room
}

export function leaveNetRoom() {
  if (!NET.room) return
  try { NET.room.leave() } catch { /* 切断済みでも無視 */ }
  for (const p of NET.players.values()) {
    if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh)
  }
  NET.room = null
  NET.roomCode = ''
  NET.players.clear()
  NET.sendState = NET.sendFire = NET.sendHit = NET.sendDown = NET.sendMatch = null
  notifyRoster()
}

export function isOnline() {
  return NET.room !== null
}

// 自動テスト（Playwright）用フック（devのみ）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__NET = { NET, selfId, joinNetRoom, leaveNetRoom, sortedIds, hostId, isHost, makeRoomCode, onRosterChange }
}
