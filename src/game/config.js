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
  // 弾が遅いと「動いている敵の少し先を狙う」必要があり、普通に狙うとまず当たらない。
  // 速くすることで「見えているところを撃てば当たる」感覚にする（実測で命中率が約2.5倍）
  laserSpeed: 190,
  laserLife: 2.0,
  // レーザーのレベル（アイテム「L」で上がる。arwing_react の lv1〜3 と同じ考え方）。
  //   offsets: 機体ローカルの左右オフセット（2本 = 二連射）
  //   hitBonus: この段階で命中半径に上乗せする量（強化＝当てやすくなる）
  laserLevels: [
    { color: 0x6dff9e, radius: 0.09, offsets: [[0, 0]], hitBonus: 0, cd: 0.30 },
    { color: 0x6dff9e, radius: 0.11, offsets: [[-1.0, 0], [1.0, 0]], hitBonus: 1.5, cd: 0.28 },
    { color: 0x49b6ff, radius: 0.15, offsets: [[-1.1, 0], [1.1, 0]], hitBonus: 3.0, cd: 0.26 },
  ],
  laserLvMax: 3,
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
  // 出現間隔（秒）。倒す速さ（約20機/分）が湧く速さ（約19機/分）を追い越して
  // フィールドが空になっていたため、間隔を半分にして常に相手がいる状態にする
  enemySpawnMin: 1.1,
  enemySpawnMax: 2.2,
  enemySpawnDist: 300,     // プレイヤーの視界の奥から自然に現れる距離（近めにして遭遇密度を上げる）
  enemySpawnSpread: 1.5,   // 出現方向の広がり（rad）。狭いほど正面に出る＝視界に入りやすい
  enemyDespawn: 900,       // これ以上離れたら静かに消す（近くに湧き直す）
  enemyInitial: 3,         // 開始直後に前方へ配置する数
  enemy1Speed: 22,
  enemy2Speed: 27,
  enemy1Scale: 4.2,        // バウンディング球半径1に正規化した後の倍率（原作並みに大きく見せる）
  enemy2Scale: 4.6,
  enemyFaceY: Math.PI,     // モデルの機首向き補正（arwing準拠）
  enemyHitRadius1: 13.0,   // レーザー命中半径（広め=快適重視。強化段階でさらに広がる）
  enemyHitRadius2: 13.5,
  enemyBodyRadius: 5.0,    // 体当たり判定
  enemyScore1: 100,
  enemyScore2: 200,
  enemyRespawnClear: 150,  // 出現位置はプレイヤーからこれ以上離す
  // 敵の絡み方（原作のように向かってきて撃ち合う）
  enemyEngageRange: 320,   // これより遠いとプレイヤーへ向き直す
  enemyBreakRange: 45,     // これより近いと横へ抜ける（すれ違い）
  enemyTurnRate: 0.9,      // プレイヤーへ向き直る速さ（rad/s）
  // 敵の攻撃弾
  enemyFireRange: 170,     // 射程（近づいてから撃たせて当たるようにする）
  enemyFireAim: 0.72,      // 機首がプレイヤーを向いている度合い（cos。±約44°）
  enemyFireCdMin: 1.8,     // 発射間隔（秒）。短すぎると弾幕になって一方的に削られる
  enemyFireCdMax: 3.6,
  enemyShotSpeed: 90,
  enemyShotLife: 4.0,
  enemyShotMiss: 4.6,      // 着弾点でのブレ幅（距離によらず一定。当てすぎ防止）
  enemyShotsMax: 8,        // 同時に飛んでいる敵弾の上限（弾幕化の防止）
  playerHitRadius: 3.6,    // 敵弾がプレイヤーに当たる半径
  damageEnemyShot: 5,      // 敵弾1発のダメージ
  playerHitGrace: 0.6,     // 被弾直後の小さな無敵時間（連続被弾での即死を防ぐ）
  damageFlashDuration: 1.2, // 被弾方向の表示時間

  // ---- 強化アイテム（3D_shooting/arwing_react の items.js と同じ4種） ----
  //   laser(L) = レーザー強化 / bomb(B) = ボム+1 / silver = シールド回復 / gold = 3個で最大シールド増
  // 元実装はレール型で「奥から流れてくる」形だったが、こちらは全方位なので
  // 「その場に浮かんで回る」形にし、一定時間で消える。
  itemDropChance: 0.38,    // 敵を倒した時に落ちる確率
  itemAmbientMax: 3,       // フィールドに漂わせておく数
  itemAmbientInterval: 7,  // 漂うアイテムを足す間隔（秒）
  itemAmbientDist: 260,    // 進行方向のこのくらい先に置く
  // 取得半径。実測で「自然に出たアイテムに最も近づいた距離」が13〜14だったため、
  // 8.0では271秒のプレイで1個も拾えなかった。余裕をもって広くとる
  itemPickupRadius: 26,
  itemMagnetRange: 70,     // この距離まで近づくと自機に引き寄せられる
  // 引き寄せの強さ（1秒あたりの寄り具合）。強すぎると自機の約6倍の速さで
  // 飛んできて「瞬間移動」に見えるため、自機速度の3倍程度に抑える
  itemMagnetPull: 1.2,
  itemLife: 30,            // 出てから消えるまで（秒）
  itemDespawn: 700,        // これ以上離れたら消す
  itemSpin: 1.8,           // 回転速度（rad/s）
  itemScore: 80,           // 取得時のスコア
  itemShieldRepair: 30,    // 銀リング: シールド回復量
  // 金リング: この個数で最大シールドアップ。3個だと1プレイ（470秒計測）で一度も
  // 到達できず機能が死んでいたため2個にする
  itemGoldNeeded: 2,
  itemShieldMaxMult: 1.5,  // 最大シールドの倍率
  itemShieldMaxCap: 200,   // 最大シールドの上限

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
