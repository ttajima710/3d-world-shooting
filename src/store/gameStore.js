// ===========================================================================
// UI表示用のReact状態のみ。60fpsで変わる値は game/state.js 側に置き、
// GameTick が約8回/秒で間引いて送る（radar含む）。
// ===========================================================================
import { create } from 'zustand'

export const useGameStore = create((set) => ({
  // screen: 'start' | 'lobby' | 'playing' | 'over' | 'result'
  //   over=ソロの墜落GAME OVER画面 / lobby=対戦ロビー / result=対戦リザルト
  screen: 'start',
  paused: false,
  score: 0,
  bombs: 3,
  shield: 100,
  kills: 0,
  // stage: 'grass' | 'space'（スタート画面/ロビーで選択）
  stage: 'grass',
  // レーダー: rx/rz = フィールド半径で正規化した位置(-1..1超も可), hd = 機首方位(rad),
  // out = 境界外, alt = 現在高度（高度メーター用）, enemies = 敵の位置（赤点表示用）,
  // players = 他プレイヤーの位置（機体色の点で表示）
  radar: { rx: 0, rz: 0, hd: 0, out: false, alt: 60, enemies: [], players: [] },
  // 衝突フラッシュ（ぶつかった直後だけ true）
  flash: false,
  // 命中マーク（敵/相手に当てた直後だけ true）
  hitMark: false,
  // 画面外の相手を指す矢印 [{x,y,b,c}]（c: -1=NPC敵 / 0以上=プレイヤーの機体色）
  markers: [],
  // 被弾方向（自機基準のrad。0=正面 / +が右 / ±π=真後ろ）。被弾していないときは null
  damage: null,

  // ---- マルチプレイ対戦 ----
  myName: '',            // 自分の名前（ロビーで入力・localStorageに記憶）
  roomCode: '',          // 部屋コード（4文字。空=オフライン）
  isHost: false,         // 自分が進行役か
  matchMode: 'time',     // 'time' | 'survival'（ロビーでホストが選択）
  // 名簿（自分含む）: {id, name, colorIdx, kills, alive, host, self}
  netPlayers: [],
  // 対戦中HUD: left=残り秒（時間マッチ）, aliveCount=残り人数（サバイバル）
  match: { active: false, mode: 'time', left: 0, aliveCount: 0, spectating: false },
  // リザルト: {ranking: [{name, colorIdx, kills, alive, self}], winner, mode}
  result: null,
  notice: '',            // 「〇〇が退室しました」等の一言表示

  setStage: (stage) => set({ stage }),
  setPlaying: () => set({ screen: 'playing', paused: false }),
  setOver: () => set({ screen: 'over', paused: false }),
  showStart: () => set({ screen: 'start', paused: false }),
  showLobby: () => set({ screen: 'lobby', paused: false }),
  showResult: (result) => set({ screen: 'result', result, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setHud: (partial) => set(partial),
}))

// 自動テスト（Playwright）から画面状態を確認するためのフック（devのみ）
if (import.meta.env.DEV && typeof window !== 'undefined') window.__store = useGameStore
