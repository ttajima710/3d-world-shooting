// ===========================================================================
// 画面外にいる相手を示す矢印（画面端）と、命中したときの手応えマーク。
// スターフォックス64のバトルモード同様「相手がどっちにいるか常に分かる」ための表示。
// 位置は GameTick が約8回/秒で store.radar ではなく store.markers に送る（DOMのみ・描画負荷ゼロ）。
// ===========================================================================
import { useGameStore } from '../store/gameStore.js'
import { CONFIG as C } from '../game/config.js'

// 画面端からの余白(px)。下側はボタン群（LOOP/BOMB/LASER/U-TURN）とレーダーがあるため深くとる
const EDGE_X = 44
const EDGE_TOP = 56    // 上部の横バー・PAUSEを避ける
const EDGE_BOTTOM = 210 // 下部のボタン群・レーダーを避ける
// 左右端の L/R ロールボタンがある高さ帯を避けるための最小オフセット（正規化Y）
const SIDE_CLEAR = 0.25

export default function TargetMarkers() {
  const screen = useGameStore((s) => s.screen)
  const markers = useGameStore((s) => s.markers)
  const hitMark = useGameStore((s) => s.hitMark)
  const damage = useGameStore((s) => s.damage)
  if (screen !== 'playing') return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]">
      {/* 画面外の相手 → 画面端の三角矢印 */}
      {(markers || []).map((m, i) => {
        // 正規化座標(-1..1)を画面端に押し出す。長い方の軸を端に合わせる
        const ax = Math.abs(m.x)
        const ay = Math.abs(m.y)
        const k = 1 / Math.max(ax, ay, 0.001)
        const nx = m.x * k
        let ny = m.y * k
        // 左右端に張り付く矢印が L/R ボタンと重ならないよう、その高さ帯を避ける。
        // 複数の矢印が同じ点に潰れないよう、順番ごとに少しずつずらす
        if (Math.abs(nx) > 0.98 && Math.abs(ny) < SIDE_CLEAR) {
          const sign = ny >= 0 ? 1 : -1
          ny = sign * (SIDE_CLEAR + (i % 3) * 0.07)
        }
        const inset = ny > 0 ? EDGE_TOP : EDGE_BOTTOM
        const left = `calc(50% + ${nx * 50}% - ${nx * EDGE_X}px)`
        const top = `calc(50% - ${ny * 50}% + ${ny * inset}px)`
        // 画面座標での向き（CSSは下方向が+Y）
        const deg = (Math.atan2(-ny, nx) * 180) / Math.PI + 90
        // アイテムは種類ごとの色を直接持っている（m.col）。それ以外は敵=赤 / 相手=機体色
        const col = m.col ?? (m.c < 0 ? '#ff2b4b' : '#' + C.playerColors[m.c % C.playerColors.length].toString(16).padStart(6, '0'))
        return (
          <div key={i} className="absolute" style={{
            left, top,
            width: 0, height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderBottom: `14px solid ${col}`,
            // 後ろ側にいる相手は薄く（真後ろの相手に振り回されないように）
            opacity: m.b ? 0.5 : 0.9,
            filter: `drop-shadow(0 0 5px ${col})`,
            transform: `translate(-50%,-50%) rotate(${deg}deg)`,
            transition: 'left .12s linear, top .12s linear',
          }} />
        )
      })}

      {/* 被弾方向インジケータ: 撃たれた向きに赤い弧が出る（原作のダメージ表示に相当） */}
      {damage !== null && (
        <div className="absolute left-1/2 top-1/2" style={{
          width: 340, height: 340,
          transform: `translate(-50%,-50%) rotate(${(damage * 180) / Math.PI}deg)`,
        }}>
          <div style={{
            position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)',
            width: 170, height: 26,
            background: 'radial-gradient(ellipse at center bottom,rgba(255,43,75,.95),rgba(255,43,75,0) 70%)',
            filter: 'drop-shadow(0 0 10px #ff2b4b)',
          }} />
        </div>
      )}

      {/* 命中マーク（当たった瞬間、照準の中心に短い×が光る） */}
      <div className="absolute left-1/2 top-1/2" style={{
        transform: `translate(-50%,-50%) scale(${hitMark ? 1 : 0.6})`,
        opacity: hitMark ? 1 : 0,
        transition: `opacity ${hitMark ? 0.04 : 0.25}s ease-out, transform .12s ease-out`,
      }}>
        <div style={{
          width: 26, height: 26,
          background:
            'linear-gradient(45deg,transparent 44%,#ffe08a 44%,#ffe08a 56%,transparent 56%),' +
            'linear-gradient(-45deg,transparent 44%,#ffe08a 44%,#ffe08a 56%,transparent 56%)',
          filter: 'drop-shadow(0 0 6px #ffb36b)',
        }} />
      </div>
    </div>
  )
}
