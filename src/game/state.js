// ===========================================================================
// フレーム毎に書き換わるミュータブル状態（Reactの状態ではない）。
// 60fpsで動く値はここに置き、UI表示用の値だけを store/gameStore.js へ間引き送信する。
// ===========================================================================
import { CONFIG, MODE, STAGES } from './config.js'

export const G = {
  // ---- THREE参照（マウント時に設定） ----
  ship: null,
  camera: null,
  rootScene: null,   // レーザー/ボム/レチクルの親としても使う
  sunLight: null,
  sunTarget: null,
  colliders: null,   // はじかれ判定の対象（草原=山 / 宇宙=隕石＋衛星）
  engineGlows: [],

  // ---- 選択中ステージの設定（control.startGame が STAGES から反映） ----
  stageCfg: STAGES.grass,

  // ---- 実行状態 ----
  state: {
    running: false,
    time: 0,
    boost: false,
    fireCd: 0,       // レーザーのクールダウン残り
    score: 0,
    shield: CONFIG.shieldMax,
    kills: 0,
    enemyCd: 1.5,    // 次の敵が湧くまでの残り秒
    lastHitT: -99,   // 最後に敵/相手へ命中させた時刻（HUDの命中マーク用）
    lastDamageT: -99, // 最後に被弾した時刻（被弾方向インジケータ用）
    // 被弾した方向（自機から見た攻撃元のワールド方向・単位ベクトル）
    damageFrom: { x: 0, y: 0, z: 1 },
  },

  // ---- 敵機プールと敵の攻撃弾 ----
  enemies: [],
  enemyShots: [],

  // ---- 墜落シーンの進行状態 ----
  crash: { t: 0, puffT: 0, vy: 0, exploded: false, overT: 0 },

  // ---- マルチプレイ対戦の進行状態（pvp.js が管理。active中はソロのGAME OVERを使わない） ----
  match: {
    active: false,
    mode: 'time',        // 'time'（時間マッチ）| 'survival'（サバイバル）
    endsAt: 0,           // 時間マッチの終了時刻（Date.now ms、壁時計基準で全員ほぼ一致）
    alive: true,         // 自分が生きているか（サバイバルで脱落するとfalse）
    respawnT: 0,         // 復活までの残り秒
    invT: 0,             // 無敵の残り秒（復活直後）
    lastAttacker: null,  // 最後に自分を撃った相手（撃墜の帰属先）
    downAnnounced: false, // 撃墜の通知を送信済みか
  },

  // ---- アクション状態（arwing_react準拠） ----
  act: {
    mode: MODE.NORMAL,
    rollDir: 0, rollTime: 0,           // バレルロール（720°）
    loopTime: 0,                        // 宙返り
    lastTap: { L: -99, R: -99 },        // ダブルタップ判定
    touchBank: 0,                       // L/Rボタン長押しの追加バンク
    bombs: CONFIG.bombStart,
  },

  // ---- エンティティプール ----
  lasers: [],
  bombs: [],
  blasts: [],

  // ---- 入力 ----
  keys: {},
  escPressed: false,                    // ESCのラッチ（低fpsでも取りこぼさない）
  shootHeld: false,                     // マウス/LASERボタン押しっぱなし
  touchAxis: { x: 0, y: 0, active: false },
}

// 自動テスト（Playwright）から状態を確認するためのフック（devのみ）
if (import.meta.env.DEV && typeof window !== 'undefined') window.__G = G
