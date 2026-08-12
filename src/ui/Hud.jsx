// HUD — arwing_react準拠レイアウト（添付1）: SCORE / PAUSE / WAVE・LASER・BOMB / SHIELD。
// 第3フェーズ: U-TURNボタン（右端・どこでも宙返り帰還）と衝突フラッシュを追加、
// 操作ガイドは左下→中央下（左下はレーダーに譲る）。
import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { startUturn } from '../game/systems/flight.js'
import { CONFIG as C } from '../game/config.js'

const playerColorCss = (idx) => '#' + C.playerColors[idx % C.playerColors.length].toString(16).padStart(6, '0')

const IS_TOUCH = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)

// 操作ガイドの文言はタッチ環境とキーボード環境で分ける
const GUIDE = IS_TOUCH
  ? [
      '左下を指でなぞって操縦',
      '右下 LASER で攻撃 ・ BOMB でボム',
      'L / R 2度押しでバレルロール',
    ]
  : [
      'WASD / 矢印 : 操縦（左右=ロール旋回）',
      'SPACE / クリック : レーザー',
      'Q / E 2度押し : バレルロール ・ I : 宙返り',
      'B : ボム ・ U : Uターン',
      'SHIFT : ブースト ・ CTRL : ブレーキ',
    ]

export default function Hud() {
  const screen = useGameStore((s) => s.screen)
  const paused = useGameStore((s) => s.paused)
  const togglePause = useGameStore((s) => s.togglePause)
  const score = useGameStore((s) => s.score)
  const bombs = useGameStore((s) => s.bombs)
  const flash = useGameStore((s) => s.flash)
  const shield = useGameStore((s) => s.shield)
  const match = useGameStore((s) => s.match)
  const netPlayers = useGameStore((s) => s.netPlayers)
  const notice = useGameStore((s) => s.notice)

  // 操作ガイドは開始から6秒だけ表示
  const [showGuide, setShowGuide] = useState(false)
  useEffect(() => {
    if (screen !== 'playing') return
    setShowGuide(true)
    const t = setTimeout(() => setShowGuide(false), 6000)
    return () => clearTimeout(t)
  }, [screen])

  if (screen !== 'playing') return null

  const box = 'absolute px-3.5 py-2 border text-[13px] tracking-[2px] backdrop-blur-[2px]'
  const boxStyle = {
    borderColor: 'rgba(57,246,255,.35)',
    // スマホの明るい空でも文字が読めるよう、背景を濃くしてコントラストを確保
    background: 'linear-gradient(180deg,rgba(3,12,28,.82),rgba(3,12,28,.55))',
    textShadow: '0 0 8px rgba(57,246,255,.7)',
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[5] font-mono text-neon">
      {/* 衝突フラッシュ: ぶつかった直後、画面の縁が一瞬赤く光る */}
      <div
        className="fixed inset-0"
        style={{
          boxShadow: 'inset 0 0 90px 30px rgba(255,43,75,.55)',
          opacity: flash ? 1 : 0,
          transition: `opacity ${flash ? 0.06 : 0.4}s ease-out`,
        }}
      />

      {/* 上部HUD帯: SCORE / WAVE等 / SHIELD を画面上端の1本の横バーにまとめて重なりを防ぐ（スマホ縦持ち対応） */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 border-b text-[11px] sm:text-[13px] tracking-[1px] sm:tracking-[2px] backdrop-blur-[2px]"
        style={boxStyle}>
        {/* 左: スコア */}
        <div className="shrink-0">
          SCORE <b className="text-gold text-[16px] sm:text-[20px]">{score}</b>
        </div>

        {/* 中央: WAVE / LASER / BOMB。対戦中は残り時間 / 残り人数を表示 */}
        <div className="shrink-0 text-center">
          {match?.active ? (
            match.mode === 'time' ? (
              <>残り <b className="text-gold text-[16px] sm:text-[20px]">
                {Math.floor(match.left / 60)}:{String(match.left % 60).padStart(2, '0')}
              </b> &nbsp; BOMB {bombs}</>
            ) : (
              <>生存 <b className="text-gold text-[16px] sm:text-[20px]">{match.aliveCount}</b> 人 &nbsp; BOMB {bombs}</>
            )
          ) : (
            <>WAVE 1 &nbsp; LASER LV1 &nbsp; BOMB {bombs}</>
          )}
        </div>

        {/* 右: シールドゲージ */}
        <div className="shrink-0 text-right">
          SHIELD
          <div className="mt-1 w-[92px] sm:w-[170px] h-[8px] sm:h-[10px] border" style={{ borderColor: 'rgba(255,59,107,.4)', background: 'rgba(255,59,107,.08)' }}>
            <div
              className={shield <= 30 ? 'h-full animate-pulse' : 'h-full'}
              style={{
                width: `${Math.max(0, shield)}%`,
                background: shield <= 30 ? 'linear-gradient(90deg,#ff2b4b,#ff5c33)' : 'linear-gradient(90deg,var(--hot),var(--gold))',
                boxShadow: '0 0 12px var(--hot)',
                transition: 'width .25s ease',
              }} />
          </div>
        </div>
      </div>

      {/* PAUSEボタン（上部帯の下・帯の高さぶん下げて重なりを回避） */}
      <button
        onClick={togglePause}
        className="pointer-events-auto absolute left-[18px] top-[50px] sm:top-[60px] px-3 py-1.5 border text-[12px] tracking-[2px] cursor-pointer"
        style={{ ...boxStyle, color: 'var(--neon)' }}>
        {paused ? '▶ RESUME' : '⏸ PAUSE'}
      </button>
      {paused && (
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 font-bold"
          style={{ fontSize: 'clamp(28px,5vw,52px)', letterSpacing: '0.3em', color: '#dffafe', textShadow: '0 0 18px var(--neon)' }}>
          PAUSED
        </div>
      )}

      {/* 対戦の順位表（上部帯の下・右上）。名前と撃墜数を機体色で */}
      {match?.active && netPlayers.length > 0 && (
        <div className={box + ' top-[50px] sm:top-[64px] right-[18px] text-right'} style={{ ...boxStyle, minWidth: 150 }}>
          {[...netPlayers].sort((a, b) => b.kills - a.kills).map((p) => (
            <div key={p.id} className="flex justify-between gap-3 text-[12px] leading-[1.9]"
              style={{ color: playerColorCss(p.colorIdx), opacity: p.alive === false ? 0.45 : 1 }}>
              <span>▲ {p.name}{p.self ? '☆' : ''}</span>
              <span>{p.kills}</span>
            </div>
          ))}
        </div>
      )}

      {/* 復活カウントダウン（時間マッチで撃墜された後） */}
      {match?.active && match.respawnIn > 0 && (
        <div className="absolute top-[34%] left-1/2 -translate-x-1/2 text-center font-bold"
          style={{ fontSize: 'clamp(20px,3.5vw,34px)', letterSpacing: '0.2em', color: '#ffd23f', textShadow: '0 0 16px #ffd23f' }}>
          復活まで {match.respawnIn}
        </div>
      )}

      {/* 観戦中の表示（サバイバルで脱落） */}
      {match?.active && match.spectating && (
        <div className="absolute top-[12%] left-1/2 -translate-x-1/2 text-center"
          style={{ fontSize: 15, letterSpacing: '0.3em', color: '#bfeaf0', textShadow: '0 0 10px var(--neon)' }}>
          — 観戦中 —
        </div>
      )}

      {/* 入退室などのお知らせ（下部中央） */}
      {notice && (
        <div className={box + ' bottom-[64px] left-1/2 -translate-x-1/2'} style={{ ...boxStyle, color: '#ffd23f' }}>
          {notice}
        </div>
      )}

      {/* U-TURNボタン（右下・ボタンエリア）: どこでも宙返り帰還（Uキーと同じ）。
          タッチ環境ではLOOP/BOMB/LASERクラスタ（右下230×200px）の真上に配置する */}
      <button
        onClick={() => startUturn()}
        className={`pointer-events-auto absolute right-[18px] ${IS_TOUCH ? 'bottom-[240px]' : 'bottom-[24px]'} w-[198px] py-2.5 border text-[14px] tracking-[3px] cursor-pointer touch-none select-none flex items-center justify-center gap-1.5`}
        style={{
          ...boxStyle,
          color: '#ffe9a8',
          borderColor: 'rgba(255,210,63,.6)',
          boxShadow: '0 0 12px rgba(255,210,63,.35)',
        }}>
        <span className="text-[17px] leading-none">⟳</span> U-TURN
      </button>

      {/* 操作ガイド（開始6秒のみ）。照準・自機の描画域を避けるため、PAUSEボタンの下・画面上部左寄せに配置 */}
      {showGuide && (
        <div
          className={box + ' left-[18px] top-[92px] sm:top-[104px] text-left max-w-[70vw] text-[11px] sm:text-[13px]'}
          style={{ ...boxStyle, opacity: 0.85 }}>
          {GUIDE.map((g) => <div key={g} className="leading-[1.9]">{g}</div>)}
        </div>
      )}
    </div>
  )
}
