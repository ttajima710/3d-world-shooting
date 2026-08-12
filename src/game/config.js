// ===========================================================================
// 全パラメータの一元管理。マジックナンバー禁止 — 必ずここを経由。
// 第2フェーズ: arwing_react準拠の武器/ロール/宙返りパラメータと
// インメルマン帰還・高度上限・レーダーを追加。
// ===========================================================================

export const CONFIG = {
  // ---- 速度（単位/秒） ----
  speedNormal: 30,
  speedBoost: 56,   // Shift
  speedBrake: 13,   // Ctrl（Spaceはレーザーに変更 = arwing準拠）
  speedLerp: 3.0,

  // ---- 回転 ----
  pitchRate: 1.5,
  pitchClamp: Math.PI / 3,               // ±60°
  invertPitch: true,   // ↑/W=上昇、↓/S=下降（ユーザー要望で反転）
  rollMax: (65 * Math.PI) / 180,
  rollLerp: 8,
  yawFactor: 1.3,

  // ---- 高度（草原の既定値。ステージ別の値は STAGES を参照） ----
  minAltitude: 5,
  maxAltitude: 150,   // 上方向の移動制限（ソフト天井）。高すぎると地面の縁が見えるため低め
  startAltitude: 60,

  // ---- フィールド境界（地面の縁が見えないよう狭め） ----
  fieldRadius: 800,

  // ---- 山との衝突（はじかれ判定） ----
  bounceSpeedKeep: 0.45,  // 衝突後に残る速度の割合
  bounceMargin: 3,        // 衝突面から離す距離

  // ---- インメルマン帰還（境界超過時の強制Uターン演出） ----
  uturnRadius: 16,        // 半ループの半径
  uturnHalfLoopTime: 1.6, // Phase A: 引き起こし（ピッチ0→180°）
  uturnRolloutTime: 0.7,  // Phase B: 背面→水平へのロールアウト
  uturnSettleTime: 0.6,   // Phase C: 中心方向への方位収束
  camBackUturn: 13,       // 演出中はカメラを引いて迫力と視界を確保

  // ---- 武器（arwing_react準拠） ----
  fireCooldown: 0.30,
  laserSpeed: 120,
  laserLife: 2.0,
  bombStart: 3,
  bombSpeed: 70,
  bombAutoDetonate: 1.0,
  bombBlastDuration: 2.0,
  bombMaxScale: 16,

  // ---- ロール / 宙返り（arwing_react準拠） ----
  doubleTapWindow: 0.25,
  rollDuration: 0.5,     // 720°ロール
  loopDuration: 2.8,     // 宙返り360°
  loopRadius: 9,

  // ---- タッチ（arwing_react準拠） ----
  touchStickRadius: 60,
  touchDeadzone: 0.18,
  touchFireRepeat: 0.15,
  touchDoubleTap: 0.25,

  // ---- チェイスカメラ（水平維持・第4フェーズで原作写真並みまで最接近） ----
  camBack: 3.1,
  camBackBoost: 4.2,
  camUp: 1.05,
  camLerp: 6,
  lookAhead: 8,

  // ---- 視野角（ブースト時に広げてスピード感を出す） ----
  fovBase: 70,
  fovBoost: 76,
  fovLerp: 3,

  // ---- 環境 ----
  fogColor: 0xc8d8e8,
  fogNear: 350,
  fogFar: 2200,        // 遠くを早めに霞ませ、地面の縁を隠す
  groundRadius: 1600,  // 飛行範囲(800)より十分広くして縁を見せない
  groundTexRepeat: 64,
  treeCount: 80,
  treeMinRadius: 60,
  treeMaxRadius: 900,
  treeHeight: 14,
  treeFixRotX: -Math.PI / 2, // GLBルートの回転補正（+90°だと根本が上向きに反転するため-90°）
  mountainSpan: 3600,
  mountainSink: 0.30,
  mountainTint: 1.0,   // 山の明るさ係数。マテリアルをmetal-rough化して本来の岩肌の色が出たため補正不要
  shadowMapSize: 2048,
  shadowRange: 120,

  // ---- 宇宙ステージ ----
  spaceSkyRadius: 3000,      // 背景球の半径（フィールド800より十分大きく）
  asteroidCount: 24,         // 隕石は数を絞って見通しよく（旧50）
  asteroidSize: 11,          // 隕石の基準サイズ（×0.6〜2.2のランダム）
  asteroidMinRadius: 120,    // 中心付近（開始地点）は空けておく
  asteroidMaxRadius: 760,
  satelliteSpin: 0.05,       // 衛星の自転速度（rad/s）

  // ---- 衝突フラッシュ（ぶつかった瞬間、画面端が赤く光る） ----
  bounceFlashDuration: 0.45,

  // ---- 露出（明るさ）。草原は空が白飛びしてHUD/照準が見えなくなるため下げる ----
  exposureGrass: 0.78,
  exposureSpace: 1.0,
  // 自分の爆風の中にカメラが入った時、視界を塞がないよう薄くする距離係数
  blastCameraFade: 1.25,

  // ---- 敵機（第4フェーズ）。当たり判定は快適さ優先で広め ----
  enemyMax: 8,             // 同時最大数
  enemySpawnMin: 2.2,      // 出現間隔（秒）
  enemySpawnMax: 4.2,
  enemySpawnDist: 300,     // プレイヤーの視界の奥から自然に現れる距離（近めにして遭遇密度を上げる）
  enemySpawnSpread: 1.5,   // 出現方向の広がり（rad）。狭いほど正面に出る＝視界に入りやすい
  enemyDespawn: 900,       // これ以上離れたら静かに消す（近くに湧き直す）
  enemyInitial: 3,         // 開始直後に前方へ配置する数
  enemy1Speed: 22,
  enemy2Speed: 27,
  enemy1Scale: 4.2,        // バウンディング球半径1に正規化した後の倍率（原作並みに大きく見せる）
  enemy2Scale: 4.6,
  enemyFaceY: Math.PI,     // モデルの機首向き補正（arwing準拠）
  enemyHitRadius1: 6.0,    // レーザー命中半径（広め=快適重視）
  enemyHitRadius2: 6.5,
  enemyBodyRadius: 5.0,    // 体当たり判定
  enemyScore1: 100,
  enemyScore2: 200,
  enemyRespawnClear: 150,  // 出現位置はプレイヤーからこれ以上離す
  // 敵の絡み方（原作のように向かってきて撃ち合う）
  enemyEngageRange: 320,   // これより遠いとプレイヤーへ向き直す
  enemyBreakRange: 45,     // これより近いと横へ抜ける（すれ違い）
  enemyTurnRate: 0.9,      // プレイヤーへ向き直る速さ（rad/s）
  // 敵の攻撃弾
  enemyFireRange: 190,     // 射程（近づいてから撃たせて当たるようにする）
  enemyFireAim: 0.65,      // 機首がプレイヤーを向いている度合い（cos。±約49°）
  enemyFireCdMin: 0.9,     // 発射間隔（秒）
  enemyFireCdMax: 2.0,
  enemyShotSpeed: 90,
  enemyShotLife: 4.0,
  enemyShotMiss: 3.2,      // 着弾点でのブレ幅（距離によらず一定。当てすぎ防止）
  playerHitRadius: 3.6,    // 敵弾がプレイヤーに当たる半径
  damageEnemyShot: 7,      // 敵弾1発のダメージ
  damageFlashDuration: 1.2, // 被弾方向の表示時間

  // ---- シールドとダメージ ----
  shieldMax: 100,
  damageBounce: 22,        // 山/隕石/衛星にはじかれた時
  damageEnemyContact: 20,  // 敵に体当たりされた時

  // ---- 墜落シーン（シールド0） ----
  crashPitch: -0.9,         // 機首下げの目標（rad）
  crashRollSpeed: 5.5,      // きりもみ回転（rad/s）
  crashGravity: 26,         // 降下加速
  crashPuffInterval: 0.12,  // 炎・煙パフの間隔
  crashTimeSpace: 2.6,      // 宇宙では時間経過で爆発（地面がないため）
  crashTimeMax: 4.5,        // 保険（草原で地面に着かない場合）
  crashToOver: 1.4,         // 大爆発からGAME OVER画面までの間

  // ---- HUD/レーダー ----
  hudSyncInterval: 0.12,  // 約8回/秒でUIへ間引き送信

  // ---- マルチプレイ対戦（第5フェーズ） ----
  netAppId: 'arwing-3dws-v1', // 部屋探しの目印（同じ目印同士だけが出会う）
  netSendRate: 12,            // 自機状態の送信回数/秒
  netLerpPos: 10,             // 他機の位置補間の強さ（大きいほど機敏・小さいほど滑らか）
  netLerpRot: 8,
  netStaleTimeout: 6,         // この秒数、状態が届かない相手は表示を隠す
  matchTime: 180,             // 時間マッチの長さ（秒）
  respawnTime: 3.0,           // 撃墜されてから復活までの秒数（時間マッチ）
  invincibleTime: 2.5,        // 復活直後の無敵秒数（点滅表示）
  pvpHitRadius: 5.0,          // 対人レーザー命中半径（広め=快適重視）
  pvpDamage: 25,              // レーザー1発のダメージ（4発で撃墜）
  pvpBombDamage: 60,          // ボム爆風のダメージ
  pvpKillScore: 500,          // 撃墜1機のスコア
  playerColors: [0x4da6ff, 0xff5a5a, 0x59d98c, 0xffd34d], // 青/赤/緑/黄
  playerColorNames: ['ブルー', 'レッド', 'グリーン', 'イエロー'],
}

// ステージ別パラメータ（gameStore.stage で選択、control.js が G.stageCfg に反映）
export const STAGES = {
  grass: {
    id: 'grass',
    label: '草原ステージ',
    minAltitude: CONFIG.minAltitude,
    maxAltitude: CONFIG.maxAltitude,
    startAltitude: CONFIG.startAltitude,
  },
  space: {
    id: 'space',
    label: '宇宙ステージ',
    minAltitude: -250,  // 地面がないので下にも飛べる
    maxAltitude: 250,
    startAltitude: 60,
  },
}

// 機体アクションのモード（arwing_react準拠 + UTURN + CRASH）
export const MODE = {
  NORMAL: 'normal',
  ROLLING: 'rolling',
  LOOPING: 'looping',
  UTURN: 'uturn',
  CRASH: 'crash',   // シールド0の墜落シーン（操作不能）
}

// arwing.glb のフィット値（arwing_react の実測値）
export const ARWING_FIT = { rotationY: Math.PI, yOffset: -0.3, scale: 1.15 }
