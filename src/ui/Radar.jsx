// レーダー（画面左下・SF64風）。正方形の枠 = フィールド境界（±fieldRadius）。
// 自機は黄色い三角矢印（機首方位に回転）。境界外では赤くなり枠端にクランプ。
// 値は GameTick が約8回/秒で store.radar に送る（毎フレーム再描画を避ける）。
// レーダー右には現在ステージの高度範囲を示す縦の高度メーターを併設する。
import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { STAGES, CONFIG as C } from '../game/config.js'

export default function Radar() {
  const screen = useGameStore((s) => s.screen)
  const radar = useGameStore((s) => s.radar)
  const stage = useGameStore((s) => s.stage)

  // 幅の狭い画面（スマホ縦持ちなど）ではレーダーを小さくする（3段階）
  const pickSize = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : Infinity
    if (w < 480) return 68
    if (w < 820) return 120
    return 170
  }
  const [SIZE, setSize] = useState(pickSize)
  useEffect(() => {
    const onResize = () => setSize(pickSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (screen !== 'playing') return null

  // スマホサイズ（SIZE<=68）では圧迫感を減らすため少し透明にする
  const dim = SIZE <= 68 ? 0.78 : 1
  // 装飾類はSIZEに連動させ、縮小時も視認性を保つ
  const altW = Math.max(6, Math.round(SIZE / 17))
  const enemyDot = Math.max(4, Math.round(SIZE / 28))
  const playerDot = Math.max(5, Math.round(SIZE / 21))
  const itemDot = Math.max(6, Math.round(SIZE / 20))
  const shipSide = Math.max(5, Math.round(SIZE / 21))
  const shipTip = Math.max(10, Math.round(SIZE / 10.6))
  const centerMark = Math.max(5, Math.round(SIZE / 24))
  const altFontSize = Math.max(7, Math.round(SIZE / 19))
  const altBarH = Math.max(2, Math.round(SIZE / 57))

  // -1..1 → 0..100%（枠端に2%マージンでクランプ）
  const toPct = (v) => Math.max(2, Math.min(98, 50 + v * 50))
  const left = toPct(radar.rx)
  const top = toPct(radar.rz)
  // three.jsのヨー+は上から見て反時計回り、CSS rotateは時計回り → 符号反転
  const deg = -(radar.hd * 180) / Math.PI
  const color = radar.out ? '#ff2b4b' : '#ffd23f'

  // 高度メーター: 現在ステージの高度範囲で 0..1 に正規化
  const sc = STAGES[stage] || STAGES.grass
  const altRatio = (radar.alt - sc.minAltitude) / (sc.maxAltitude - sc.minAltitude)
  const altPct = Math.max(2, Math.min(98, altRatio * 100))

  return (
    <div className="pointer-events-none fixed z-[5] flex items-end gap-[6px]"
      style={{ left: 'calc(14px + env(safe-area-inset-left))', bottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
      <div
        className="relative"
        style={{
          width: SIZE, height: SIZE,
          opacity: dim,
          border: '1px solid rgba(68,255,102,.55)',
          background: 'rgba(0,40,16,.35)',
          boxShadow: '0 0 12px rgba(68,255,102,.25), inset 0 0 24px rgba(68,255,102,.12)',
          backdropFilter: 'blur(2px)',
          // 細グリッド
          backgroundImage:
            'linear-gradient(rgba(68,255,102,.14) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(68,255,102,.14) 1px, transparent 1px)',
          backgroundSize: `${SIZE / 6}px ${SIZE / 6}px`,
        }}>
        {/* 中心マーク（フィールド中心） */}
        <div className="absolute" style={{
          left: '50%', top: '50%', width: centerMark, height: centerMark,
          transform: 'translate(-50%,-50%)',
          background:
            `linear-gradient(rgba(68,255,102,.8), rgba(68,255,102,.8)) center/1px ${centerMark}px no-repeat,` +
            `linear-gradient(rgba(68,255,102,.8), rgba(68,255,102,.8)) center/${centerMark}px 1px no-repeat`,
        }} />
        {/* 敵機（赤点。枠外は非表示、自機三角より下のレイヤー） */}
        {radar.enemies.map((e, i) => {
          if (Math.abs(e.x) > 1.05 || Math.abs(e.z) > 1.05) return null
          return (
            <div key={i} className="absolute" style={{
              left: `${toPct(e.x)}%`, top: `${toPct(e.z)}%`,
              width: enemyDot, height: enemyDot, borderRadius: '50%',
              background: '#ff2b4b',
              boxShadow: '0 0 5px #ff2b4b',
              transform: 'translate(-50%,-50%)',
            }} />
          )
        })}
        {/* 強化アイテム（種類ごとの色の四角。丸い敵機と形で区別できるようにする） */}
        {(radar.items || []).map((it, i) => {
          if (Math.abs(it.x) > 1.05 || Math.abs(it.z) > 1.05) return null
          return (
            <div key={'i' + i} className="absolute" style={{
              left: `${toPct(it.x)}%`, top: `${toPct(it.z)}%`,
              width: itemDot, height: itemDot,
              background: it.c,
              boxShadow: `0 0 5px ${it.c}`,
              transform: 'translate(-50%,-50%) rotate(45deg)',
            }} />
          )
        })}
        {/* 他プレイヤー（機体色の点。敵の赤点より少し大きい） */}
        {(radar.players || []).map((p, i) => {
          if (Math.abs(p.x) > 1.05 || Math.abs(p.z) > 1.05) return null
          const col = '#' + C.playerColors[p.c % C.playerColors.length].toString(16).padStart(6, '0')
          return (
            <div key={'p' + i} className="absolute" style={{
              left: `${toPct(p.x)}%`, top: `${toPct(p.z)}%`,
              width: playerDot, height: playerDot, borderRadius: '50%',
              background: col,
              border: '1px solid rgba(255,255,255,.7)',
              boxShadow: `0 0 6px ${col}`,
              transform: 'translate(-50%,-50%)',
            }} />
          )
        })}
        {/* 自機（三角矢印） */}
        <div className="absolute" style={{
          left: `${left}%`, top: `${top}%`,
          width: 0, height: 0,
          borderLeft: `${shipSide}px solid transparent`,
          borderRight: `${shipSide}px solid transparent`,
          borderBottom: `${shipTip}px solid ${color}`,
          transform: `translate(-50%,-55%) rotate(${deg}deg)`,
          filter: `drop-shadow(0 0 6px ${color})`,
          transition: 'left .12s linear, top .12s linear',
        }} />
      </div>
      {/* 高度メーター */}
      <div className="relative" style={{
        width: altW, height: SIZE,
        opacity: dim,
        border: '1px solid rgba(68,255,102,.55)',
        background: 'rgba(0,40,16,.35)',
        boxShadow: '0 0 12px rgba(68,255,102,.25), inset 0 0 24px rgba(68,255,102,.12)',
      }}>
        <div className="absolute" style={{
          left: '50%', top: -(altFontSize + 4), transform: 'translateX(-50%)',
          fontSize: altFontSize, color: 'rgba(68,255,102,.85)', letterSpacing: 1,
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}>ALT</div>
        <div className="absolute" style={{
          left: 0, right: 0, height: altBarH,
          bottom: `${altPct}%`,
          background: '#ffd23f',
          boxShadow: '0 0 8px 2px #ffd23f',
          transition: 'bottom .12s linear',
        }} />
      </div>
    </div>
  )
}
