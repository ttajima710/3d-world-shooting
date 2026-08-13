// Virtual touch controller: dynamic joystick (left) + action cluster (right) +
// edge roll buttons. Writes into G.touchAxis / G.shootHeld. Ported from
// arwing_react/src/ui/TouchControls.jsx (setupTouchControls() of the original).
import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { G } from '../game/state.js'
import { CONFIG } from '../game/config.js'
import { startLoop, rollButtonPress, rollButtonRelease } from '../game/systems/flight.js'
import { fireLaser, launchBomb, triggerBombDetonations, laserCooldown } from '../game/systems/weapons.js'

const IS_TOUCH = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)

export default function TouchControls() {
  const screen = useGameStore((s) => s.screen)
  const bombs = useGameStore((s) => s.bombs)
  const baseRef = useRef(null)
  const knobRef = useRef(null)
  const stick = useRef({ id: null, ox: 0, oy: 0 })

  useEffect(() => {
    const zone = document.getElementById('stickZone')
    if (!zone) return
    const R = CONFIG.touchStickRadius
    const base = baseRef.current, knob = knobRef.current

    function setStick(dx, dy) {
      const len = Math.hypot(dx, dy)
      const cl = Math.min(len, R)
      const ang = Math.atan2(dy, dx)
      const kx = Math.cos(ang) * cl, ky = Math.sin(ang) * cl
      if (knob) { knob.style.left = 50 + (kx / base.offsetWidth) * 100 + '%'; knob.style.top = 50 + (ky / base.offsetHeight) * 100 + '%' }
      let nx = kx / R, ny = ky / R
      const mag = Math.hypot(nx, ny)
      if (mag < CONFIG.touchDeadzone) { G.touchAxis.x = 0; G.touchAxis.y = 0 }
      else {
        const scaled = (mag - CONFIG.touchDeadzone) / (1 - CONFIG.touchDeadzone)
        nx = (nx / mag) * scaled; ny = (ny / mag) * scaled
        G.touchAxis.x = nx; G.touchAxis.y = -ny
      }
      G.touchAxis.active = true
    }
    function resetStick() { G.touchAxis.x = 0; G.touchAxis.y = 0; G.touchAxis.active = false; if (base) base.style.display = 'none'; stick.current.id = null }

    const onStart = (e) => {
      e.preventDefault()
      if (stick.current.id !== null) return
      const t = e.changedTouches[0]
      // レーダー（左下・約210×190px）の上での操縦タッチは無視する。
      // これをやらないとレーダーに指が重なって、操縦中はレーダーが見えなくなる。
      if (t.clientX < 210 && (window.innerHeight - t.clientY) < 190) return
      stick.current.id = t.identifier; stick.current.ox = t.clientX; stick.current.oy = t.clientY
      if (base) { base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.style.display = 'block' }
      setStick(0, 0)
    }
    const onMove = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stick.current.id) setStick(t.clientX - stick.current.ox, t.clientY - stick.current.oy) }
    const onEnd = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stick.current.id) resetStick() }

    zone.addEventListener('touchstart', onStart, { passive: false })
    zone.addEventListener('touchmove', onMove, { passive: false })
    zone.addEventListener('touchend', onEnd, { passive: false })
    zone.addEventListener('touchcancel', onEnd, { passive: false })
    return () => {
      zone.removeEventListener('touchstart', onStart); zone.removeEventListener('touchmove', onMove)
      zone.removeEventListener('touchend', onEnd); zone.removeEventListener('touchcancel', onEnd)
    }
  }, [screen])

  // Reset the virtual stick whenever we leave the play screen. If the player died
  // with a finger still on the stick, its touchend never fires (the #stickZone
  // element unmounts first), leaving stick.current.id + G.touchAxis stuck — which
  // pins the next run's ship to a screen edge and makes the stick ignore new touches.
  useEffect(() => {
    if (screen !== 'playing') {
      stick.current.id = null
      G.touchAxis.x = 0; G.touchAxis.y = 0; G.touchAxis.active = false
      G.shootHeld = false
      if (baseRef.current) baseRef.current.style.display = 'none'
    }
  }, [screen])

  // Defensive global release: a finger lifted after the stick element is gone, or
  // a window blur, still clears the stick/fire state. Only fires when ALL touches
  // are up (touches.length === 0) so multi-touch (steer + tap) isn't disrupted.
  useEffect(() => {
    const releaseAll = () => {
      stick.current.id = null
      G.touchAxis.x = 0; G.touchAxis.y = 0; G.touchAxis.active = false
      G.shootHeld = false
      if (baseRef.current) baseRef.current.style.display = 'none'
    }
    const onTouchEnd = (e) => { if (!e.touches || e.touches.length === 0) releaseAll() }
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])

  if (!IS_TOUCH || screen !== 'playing') return null

  // Press/release helper using Pointer Events (one unified path for touch + mouse).
  // Pointer events are reliable across mobile browsers where the old separate
  // touchstart/mousedown handlers sometimes failed to register. setPointerCapture
  // guarantees the matching "up" fires on this button even if the finger slides off.
  const press = (onDown, onUp) => ({
    onPointerDown: (e) => {
      e.preventDefault(); e.stopPropagation()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) { /* ignore */ }
      onDown && onDown()
    },
    onPointerUp: (e) => { e.preventDefault(); e.stopPropagation(); onUp && onUp() },
    onPointerCancel: () => { onUp && onUp() },
  })

  // hold to auto-fire (GameTick repeats at CONFIG.fireCooldown); fire one immediately
  const fireDown = () => { G.shootHeld = true; if (G.state.fireCd <= 0 && G.act.mode !== 'looping' && G.act.mode !== 'uturn') { fireLaser(); G.state.fireCd = laserCooldown() } }
  // touch-none = touch-action:none so the browser never steals the tap as a scroll/zoom gesture
  // ルート全体は透過させず（押しづらくなるため）、ボタン個別に opacity-75（押下中は opacity-100）を付ける
  const btn = 'pointer-events-auto touch-none rounded-full flex items-center justify-center font-mono select-none opacity-75 active:opacity-100'

  return (
    <div className="fixed inset-0 z-[7] pointer-events-none" style={{
      touchAction: 'none',
      // iPhoneのノッチ／ホームインジケータ領域にボタンが潜り込まないよう安全域を確保
      paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      <div id="stickZone" className="absolute left-0 bottom-0 w-[45%] h-[60%] pointer-events-auto" />
      <div ref={baseRef} className="absolute w-[130px] h-[130px] rounded-full -translate-x-1/2 -translate-y-1/2 hidden"
        style={{ border: '2px solid rgba(57,246,255,.55)', background: 'radial-gradient(circle,rgba(57,246,255,.12),rgba(8,20,38,.35))' }}>
        <div ref={knobRef} className="absolute left-1/2 top-1/2 w-[58px] h-[58px] rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'rgba(57,246,255,.5)', border: '2px solid rgba(57,246,255,.9)', boxShadow: '0 0 18px rgba(57,246,255,.7)' }} />
      </div>

      <button className={btn + ' absolute left-[14px] bottom-[46%] w-[62px] h-[62px] text-[18px] font-bold'} style={edge}
        {...press(() => rollButtonPress('L'), () => rollButtonRelease())}>L</button>
      <button className={btn + ' absolute right-[14px] bottom-[46%] w-[62px] h-[62px] text-[18px] font-bold'} style={edge}
        {...press(() => rollButtonPress('R'), () => rollButtonRelease())}>R</button>

      <div className="absolute right-[18px] bottom-[24px] w-[230px] h-[200px]">
        <button className={btn + ' absolute right-[60px] bottom-[110px] w-[60px] h-[60px] text-[11px]'} style={small}
          {...press(() => { if (G.act.mode === 'normal') startLoop() })}>LOOP</button>
        <button className={btn + ' absolute right-[104px] bottom-[14px] w-[68px] h-[68px] text-[11px] flex-col'} style={med}
          {...press(() => { if (!triggerBombDetonations()) launchBomb() })}>BOMB<span className="text-[15px] font-bold text-white">{bombs}</span></button>
        <button className={btn + ' absolute right-0 bottom-0 w-[96px] h-[96px] text-[15px]'} style={big}
          {...press(fireDown, () => { G.shootHeld = false })}>LASER</button>
      </div>
    </div>
  )
}

const edge = { border: '2px solid rgba(57,246,255,.8)', background: 'rgba(8,20,38,.5)', color: '#dffafe', boxShadow: '0 0 14px rgba(57,246,255,.4)' }
const big = { border: '2px solid rgba(109,255,158,.9)', background: 'rgba(8,20,38,.5)', color: '#d6ffe6', boxShadow: '0 0 16px rgba(109,255,158,.5)' }
const med = { border: '2px solid rgba(255,210,63,.9)', background: 'rgba(8,20,38,.5)', color: '#ffe9a8', boxShadow: '0 0 14px rgba(255,210,63,.45)' }
const small = { border: '2px solid rgba(177,75,255,.9)', background: 'rgba(8,20,38,.5)', color: '#e7ccff', boxShadow: '0 0 12px rgba(177,75,255,.45)' }
