// ===========================================================================
// 他プレイヤーの機体表示（マルチプレイ）。
// 受信した位置/向きをなめらかに補間し、機体色（4色）と名前ラベルを付ける。
// 名簿の増減は onRosterChange 購読で React に反映、毎フレームの動きは NET.players 直読み。
// ===========================================================================
import * as THREE from 'three'
import { useMemo, useEffect, useState, useRef } from 'react'
import { useGLTF, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { NET, onRosterChange, colorIndexOf } from '../net/net.js'
import { CONFIG as C } from './config.js'
import { buildArwingModel } from './Ship.jsx'

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()

function RemoteShip({ id, colorIdx, name }) {
  const gltf = useGLTF('./models/arwing.glb')
  const inited = useRef(false)

  const group = useMemo(() => {
    const g = new THREE.Group()
    g.visible = false
    try {
      g.add(buildArwingModel(gltf.scene, C.playerColors[colorIdx]))
    } catch (e) {
      const fallback = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 3, 6),
        new THREE.MeshStandardMaterial({ color: C.playerColors[colorIdx] }),
      )
      fallback.rotation.x = -Math.PI / 2
      g.add(fallback)
    }
    // エンジングロー（機体色）
    const glowMat = new THREE.MeshBasicMaterial({
      color: C.playerColors[colorIdx], transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    ;[[-0.32, -0.09], [0.32, -0.09]].forEach(([ox, oy]) => {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glowMat.clone())
      glow.position.set(ox * 1.15, oy * 1.15, 1.1 * 1.15)
      g.add(glow)
    })
    return g
  }, [gltf, colorIdx])

  // 実体をNETに登録（pvpの当たり判定・レーダー・テストが補間後の位置を参照する）
  useEffect(() => {
    const p = NET.players.get(id)
    if (p) p.mesh = group
    return () => {
      const p2 = NET.players.get(id)
      if (p2 && p2.mesh === group) p2.mesh = null
    }
  }, [group, id])

  useFrame((_, delta) => {
    const p = NET.players.get(id)
    const st = p && p.state
    if (!st || !st.p) { group.visible = false; return }
    const stale = performance.now() / 1000 - p.lastT > C.netStaleTimeout
    group.visible = !stale && st.vis !== false

    const dt = Math.min(delta, 0.05)
    tmpPos.set(st.p[0], st.p[1], st.p[2])
    tmpQuat.set(st.q[0], st.q[1], st.q[2], st.q[3])
    // 初回・大ワープ（復活など）は補間せず一気に移動
    if (!inited.current || group.position.distanceToSquared(tmpPos) > 80 * 80) {
      group.position.copy(tmpPos)
      group.quaternion.copy(tmpQuat)
      inited.current = true
      return
    }
    group.position.lerp(tmpPos, Math.min(1, C.netLerpPos * dt))
    group.quaternion.slerp(tmpQuat, Math.min(1, C.netLerpRot * dt))
  })

  const colorCss = '#' + C.playerColors[colorIdx].toString(16).padStart(6, '0')
  return (
    <primitive object={group}>
      <Html position={[0, 2.2, 0]} center distanceFactor={60} zIndexRange={[5, 0]}>
        <div
          className="whitespace-nowrap font-bold text-[13px] px-1.5 py-0.5 rounded pointer-events-none select-none"
          style={{ color: colorCss, background: 'rgba(0,0,0,0.35)', textShadow: '0 0 4px #000' }}
        >
          {name}
        </div>
      </Html>
    </primitive>
  )
}

export default function RemotePlayers() {
  const [roster, setRoster] = useState([])

  useEffect(() => {
    const sync = () =>
      setRoster([...NET.players.keys()].map((id) => ({
        id,
        colorIdx: colorIndexOf(id),
        name: NET.players.get(id)?.name || '？',
      })))
    sync()
    return onRosterChange(sync)
  }, [])

  return roster.map((r) => <RemoteShip key={r.id} id={r.id} colorIdx={r.colorIdx} name={r.name} />)
}
