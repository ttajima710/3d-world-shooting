import * as THREE from 'three'
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Loader } from '@react-three/drei'
import { CONFIG } from './game/config.js'
import Environment3D from './game/environment.jsx'
import Ship from './game/Ship.jsx'
import RemotePlayers from './game/RemotePlayers.jsx'
import GameTick from './game/GameTick.jsx'
import { installInput } from './input/input.js'
import Hud from './ui/Hud.jsx'
import Radar from './ui/Radar.jsx'
import TargetMarkers from './ui/TargetMarkers.jsx'
import TouchControls from './ui/TouchControls.jsx'
import Overlays from './ui/Overlays.jsx'

export default function App() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 70, near: 0.1, far: 8000, position: [0, 64, 214] }}
        onCreated={({ gl }) => {
          // 要件定義書 F-2: PBR向けレンダラー設定（R3F既定値だが明示する）
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = CONFIG.exposureGrass // 空の白飛び防止（宇宙は SpaceSky が戻す）
          installInput(gl.domElement) // クリック発射のためcanvasを渡す
          if (import.meta.env.DEV) window.__gl = gl // 自動テスト用フック（devのみ）
        }}
      >
        <color attach="background" args={[0x0a0e2a]} />
        <Suspense fallback={null}>
          <Environment3D />
          <Ship />
          <RemotePlayers />
        </Suspense>
        <GameTick />
      </Canvas>

      {/* CRT風ヴィネット */}
      <div className="vignette pointer-events-none fixed inset-0 z-[6]" />

      <Hud />
      <TargetMarkers />
      <Radar />
      <TouchControls />
      <Overlays />
      <Loader />
    </div>
  )
}
