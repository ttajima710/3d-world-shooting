// タイトル / GAME OVER / 対戦ロビー / 対戦リザルト（arwing_react Overlays.jsx のスタイルを流用）
import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { startGame } from '../game/control.js'
import { STAGES, CONFIG as C } from '../game/config.js'
import { NET, joinNetRoom, leaveNetRoom, makeRoomCode, isOnline } from '../net/net.js'
import { startMatchAsHost, syncNetPlayers } from '../game/systems/pvp.js'

// タッチ端末かどうか（Hud.jsx / TouchControls.jsx と同じ判定）
const IS_TOUCH = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)

const KEYS_KEYBOARD = [
  'W / S（↑ / ↓）: 機首の上げ下げ（±60°まで）',
  'A / D（← / →）: ロールして旋回',
  'SPACE / クリック : レーザー ・ B : ボム',
  'Q / E 2度押し : バレルロール ・ I : 宙返り',
  'SHIFT : ブースト ・ CTRL : ブレーキ',
  'U : どこでもUターン（宙返り帰還）',
]

const KEYS_TOUCH = [
  '左下を指でなぞって操縦',
  '右下 LASER ボタンで攻撃',
  'BOMB / LOOP / U-TURN ボタンも右下',
  'L・R 2度押しでバレルロール',
]

const KEYS = IS_TOUCH ? KEYS_TOUCH : KEYS_KEYBOARD

// 絵文字はフォント環境によって表示されないため、CSSグラデーションの見本画像にする
const STAGE_THUMBS = {
  grass: 'linear-gradient(180deg,#8fc1e8 0%,#a8cfe0 45%,#7fae5a 55%,#5a8a3f 100%)',
  space: 'radial-gradient(circle at 30% 35%,#6a4fa0 0%,#1a1440 45%,#05030f 100%)',
}

const NAME_KEY = 'arwing3d_name'
const colorCss = (idx) => '#' + C.playerColors[idx % C.playerColors.length].toString(16).padStart(6, '0')
const urlRoomCode = () => {
  const m = /[?&]room=([A-Za-z0-9]{3,8})/.exec(window.location.search)
  return m ? m[1].toUpperCase() : ''
}
const shareUrl = (code) => `${window.location.origin}${window.location.pathname}?room=${code}`

const overlayBg = { background: 'radial-gradient(ellipse at center,rgba(4,10,26,.6),rgba(2,4,12,.94))' }
const primaryBtn = { letterSpacing: '4px', color: 'var(--ink)', background: 'var(--neon)', boxShadow: '0 0 24px var(--neon)' }
const ghostBtn = {
  letterSpacing: '3px', color: '#dffafe',
  border: '1px solid rgba(57,246,255,.5)', background: 'rgba(8,20,38,.6)',
}

function StageSelect({ stage, onSelect, size = 160 }) {
  return (
    <div className="flex gap-4">
      {Object.values(STAGES).map((s) => {
        const active = stage === s.id
        return (
          <div
            key={s.id}
            onClick={onSelect ? () => onSelect(s.id) : undefined}
            className={`flex flex-col items-center justify-center gap-1.5 ${onSelect ? 'pointer-events-auto cursor-pointer' : 'opacity-80'}`}
            style={{
              width: size, height: size * 0.56,
              border: active ? '2px solid var(--neon)' : '1px solid rgba(57,246,255,.25)',
              background: active ? 'rgba(57,246,255,.12)' : 'rgba(8,20,38,.5)',
              boxShadow: active ? '0 0 18px var(--neon)' : 'none',
              color: active ? '#dffafe' : '#9fc8d0',
            }}>
            <span style={{
              width: size * 0.75, height: size * 0.25, borderRadius: 3,
              background: STAGE_THUMBS[s.id],
              boxShadow: 'inset 0 0 8px rgba(0,0,0,.45)',
            }} />
            <span style={{ fontSize: 13 }}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---- 対戦ロビー（部屋作成/参加 → 参加者一覧 → ホストがルールを決めて開始） ----
function LobbyScreen() {
  const stage = useGameStore((s) => s.stage)
  const setStage = useGameStore((s) => s.setStage)
  const matchMode = useGameStore((s) => s.matchMode)
  const netPlayers = useGameStore((s) => s.netPlayers)
  const iAmHost = useGameStore((s) => s.isHost)
  const roomCode = useGameStore((s) => s.roomCode)
  const showStart = useGameStore((s) => s.showStart)
  const setHud = useGameStore((s) => s.setHud)

  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '')
  const [copied, setCopied] = useState(false)
  const joined = isOnline()
  const fromUrl = urlRoomCode()

  const join = (code, creator) => {
    const nm = (name || 'プレイヤー').slice(0, 10)
    localStorage.setItem(NAME_KEY, nm)
    setHud({ myName: nm })
    joinNetRoom(code, nm, creator)
    syncNetPlayers()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(roomCode))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* 手動コピー用にURLを表示しているので無視 */ }
  }

  const exit = () => {
    leaveNetRoom()
    showStart()
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center gap-[16px] px-4" style={overlayBg}>
      <h1 className="text-white font-bold leading-none"
        style={{ fontSize: 'clamp(22px,4.5vw,44px)', letterSpacing: '6px', textShadow: '0 0 18px var(--neon)' }}>
        みんなで対戦
      </h1>

      {!joined && (
        <>
          <p className="text-[13px] leading-[1.9]" style={{ color: '#bfeaf0' }}>
            あなたの名前を入力してください（対戦相手の画面に表示されます）
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={10}
            placeholder="なまえ"
            className="pointer-events-auto text-center text-[18px] px-4 py-2.5 outline-none"
            style={{ ...ghostBtn, width: 240, letterSpacing: '2px' }}
          />
          <div className="flex gap-4">
            {fromUrl ? (
              <button onClick={() => join(fromUrl, false)}
                className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3 border-0" style={primaryBtn}>
                ルーム {fromUrl} に参加
              </button>
            ) : (
              <button onClick={() => join(makeRoomCode(), true)}
                className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3 border-0" style={primaryBtn}>
                部屋を作る
              </button>
            )}
            <button onClick={exit} className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3" style={ghostBtn}>
              もどる
            </button>
          </div>
        </>
      )}

      {joined && (
        <>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[12px]" style={{ letterSpacing: '3px', color: '#bfeaf0' }}>
              ルームコード <b style={{ color: '#dffafe', fontSize: 16 }}>{roomCode}</b> ・ このURLを友達に送ろう
            </span>
            <div className="flex items-center gap-2">
              <span className="pointer-events-auto select-all text-[12px] px-3 py-1.5" style={ghostBtn}>
                {shareUrl(roomCode)}
              </span>
              <button onClick={copy}
                className="pointer-events-auto cursor-pointer text-[12px] px-3 py-1.5 border-0"
                style={{ ...primaryBtn, letterSpacing: '1px' }}>
                {copied ? 'コピーしました！' : 'URLをコピー'}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-[12px]" style={{ letterSpacing: '3px', color: '#bfeaf0' }}>参加者（{netPlayers.length}/4）</span>
            <div className="flex gap-3 flex-wrap justify-center">
              {netPlayers.map((p) => (
                <span key={p.id} className="text-[14px] px-3 py-1.5"
                  style={{ ...ghostBtn, color: colorCss(p.colorIdx), letterSpacing: '1px' }}>
                  ▲ {p.name}{p.self ? '（あなた）' : ''}{p.host ? ' ★' : ''}
                </span>
              ))}
            </div>
            <span className="text-[11px]" style={{ color: '#7fa8b0' }}>★=進行役（ルールを決めて開始する人）</span>
          </div>

          {iAmHost ? (
            <>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[12px]" style={{ letterSpacing: '3px', color: '#bfeaf0' }}>ルール</span>
                <div className="flex gap-3">
                  {[
                    { id: 'time', label: `時間マッチ（${Math.round(C.matchTime / 60)}分・撃墜数で勝負）` },
                    { id: 'survival', label: 'サバイバル（最後の1人が勝ち）' },
                  ].map((m) => (
                    <button key={m.id} onClick={() => setHud({ matchMode: m.id })}
                      className="pointer-events-auto cursor-pointer text-[13px] px-4 py-2"
                      style={{
                        ...ghostBtn,
                        border: matchMode === m.id ? '2px solid var(--neon)' : ghostBtn.border,
                        background: matchMode === m.id ? 'rgba(57,246,255,.12)' : ghostBtn.background,
                        boxShadow: matchMode === m.id ? '0 0 14px var(--neon)' : 'none',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <StageSelect stage={stage} onSelect={setStage} size={140} />
              <div className="flex gap-4">
                <button onClick={() => startMatchAsHost()}
                  className="pointer-events-auto cursor-pointer font-mono text-[16px] px-9 py-3.5 border-0" style={primaryBtn}>
                  MISSION START
                </button>
                <button onClick={exit} className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3" style={ghostBtn}>
                  退室
                </button>
              </div>
              {netPlayers.length < 2 && (
                <span className="text-[11px]" style={{ color: '#7fa8b0' }}>URLを送って友達が入ってきたら開始しよう（1人でも練習飛行できます）</span>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px]" style={{ color: '#dffafe' }}>
                進行役がルールを決めて開始するのを待っています…
              </p>
              <button onClick={exit} className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3" style={ghostBtn}>
                退室
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---- 対戦リザルト ----
function ResultScreen() {
  const result = useGameStore((s) => s.result)
  const iAmHost = useGameStore((s) => s.isHost)
  const showLobby = useGameStore((s) => s.showLobby)
  const showStart = useGameStore((s) => s.showStart)
  if (!result) return null

  const exit = () => {
    leaveNetRoom()
    showStart()
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center gap-[16px] px-4" style={overlayBg}>
      <h1 className="font-bold leading-none"
        style={{
          fontSize: 'clamp(26px,5.5vw,54px)', letterSpacing: '6px', color: '#ffd23f',
          textShadow: '0 0 18px #ffd23f,0 0 40px rgba(255,210,63,.5)',
        }}>
        {result.mode === 'survival' ? 'SURVIVAL 決着！' : 'TIME UP！'}
      </h1>
      <div className="text-[20px]" style={{ color: '#dffafe' }}>
        勝者 <b style={{ color: '#ffd23f' }}>{result.winner}</b>
      </div>
      <div className="flex flex-col gap-1.5" style={{ minWidth: 300 }}>
        {result.ranking.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-6 text-[15px] px-4 py-2"
            style={{ ...ghostBtn, color: colorCss(r.colorIdx) }}>
            <span>{i + 1}位 ▲ {r.name}{r.self ? '（あなた）' : ''}</span>
            <span style={{ color: '#dffafe' }}>
              撃墜 {r.kills}{result.mode === 'survival' ? (r.alive ? ' ・生存' : '') : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        {iAmHost && (
          <button onClick={() => startMatchAsHost()}
            className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3 border-0" style={primaryBtn}>
            もう一回
          </button>
        )}
        <button onClick={() => showLobby()} className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3" style={ghostBtn}>
          ロビーへ
        </button>
        <button onClick={exit} className="pointer-events-auto cursor-pointer font-mono text-[15px] px-8 py-3" style={ghostBtn}>
          退室してタイトル
        </button>
      </div>
      {!iAmHost && <span className="text-[11px]" style={{ color: '#7fa8b0' }}>進行役が「もう一回」を押すと自動で再戦が始まります</span>}
    </div>
  )
}

export default function Overlays() {
  const screen = useGameStore((s) => s.screen)
  const stage = useGameStore((s) => s.stage)
  const setStage = useGameStore((s) => s.setStage)
  const score = useGameStore((s) => s.score)
  const kills = useGameStore((s) => s.kills)
  const showStart = useGameStore((s) => s.showStart)
  const showLobby = useGameStore((s) => s.showLobby)

  // URLに ?room= が付いていたら、最初から「みんなで対戦」へ誘導
  useEffect(() => {
    if (urlRoomCode() && useGameStore.getState().screen === 'start') showLobby()
  }, [showLobby])

  if (screen === 'lobby') return <LobbyScreen />
  if (screen === 'result') return <ResultScreen />

  if (screen === 'over') {
    return (
      <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center gap-[18px] px-4" style={overlayBg}>
        <h1 className="font-bold leading-none"
          style={{
            fontSize: 'clamp(28px,6vw,60px)', letterSpacing: '6px', color: '#ff2b4b',
            textShadow: '0 0 18px #ff2b4b,0 0 40px #ff2b4b',
          }}>
          MISSION FAILED
        </h1>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[24px]" style={{ color: '#ffd23f' }}>SCORE {score}</span>
          <span className="text-[14px]" style={{ color: '#bfeaf0' }}>撃墜数 {kills}</span>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => startGame()}
            className="pointer-events-auto cursor-pointer font-mono text-[16px] px-9 py-3.5 border-0" style={primaryBtn}>
            RETRY
          </button>
          <button
            onClick={() => showStart()}
            className="pointer-events-auto cursor-pointer font-mono text-[16px] px-9 py-3.5" style={ghostBtn}>
            TITLE
          </button>
        </div>
      </div>
    )
  }

  if (screen !== 'start') return null
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center gap-[18px] px-4" style={overlayBg}>
      <h1 className="text-white font-bold leading-none"
        style={{ fontSize: 'clamp(30px,7vw,72px)', letterSpacing: '8px', textShadow: '0 0 18px var(--neon),0 0 40px var(--neon)' }}>
        3D WORLD SHOOTING
      </h1>
      <p className="max-w-[560px] leading-[1.8] text-[13px]" style={{ color: '#bfeaf0', letterSpacing: '1px' }}>
        全方位フライトデモ。草原と山のフィールドを自由に飛び回れ。<br />
        エリアの端まで行くと自動でUターンする。<br />
        ステージを選んで出撃しよう。
      </p>
      <div className="flex flex-col items-center gap-2.5">
        <span className="text-[12px]" style={{ letterSpacing: '3px', color: '#bfeaf0' }}>STAGE SELECT</span>
        <StageSelect stage={stage} onSelect={setStage} />
      </div>
      <div className="flex gap-2.5 flex-wrap justify-center max-w-[620px]">
        {KEYS.map((k) => (
          <span key={k} className="border px-2.5 py-1.5 text-[12px]"
            style={{ borderColor: 'rgba(57,246,255,.4)', color: '#dffafe' }}>{k}</span>
        ))}
      </div>
      <div className="flex gap-4 flex-wrap justify-center">
        <button
          onClick={() => startGame()}
          className="pointer-events-auto cursor-pointer font-mono text-[16px] px-9 py-3.5 border-0" style={primaryBtn}>
          ひとりで遊ぶ
        </button>
        <button
          onClick={() => showLobby()}
          className="pointer-events-auto cursor-pointer font-mono text-[16px] px-9 py-3.5"
          style={{ ...ghostBtn, letterSpacing: '4px' }}>
          みんなで対戦
        </button>
      </div>
    </div>
  )
}
