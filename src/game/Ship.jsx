// ===========================================================================
// プレイヤー機体（arwing_react Ship.jsx を流用）。arwing.glb のフィット＋自己発光
// ＋双発エンジングロー。読み込み失敗時は簡易メッシュにフォールバック。
// 追加: 地面へ影を落とすため castShadow を有効化。
// ===========================================================================
import * as THREE from 'three'
import { useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { G } from './state.js'
import { ARWING_FIT, CONFIG as C } from './config.js'

function buildShipFallback() {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.6, roughness: 0.4 })
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 6), mat)
  body.rotation.x = -Math.PI / 2
  g.add(body)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 1), mat)
  g.add(wing)
  return g
}

// arwing.glb を実寸フィット＋発光調整して組み立てる（tint指定でマルチプレイの機体色付け）。
// RemotePlayers.jsx と共用。
export function buildArwingModel(gltfScene, tint = null) {
  const model = gltfScene.clone(true)
  model.rotation.y = ARWING_FIT.rotationY
  model.position.y = ARWING_FIT.yOffset
  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  box.getSize(size)
  const longest = Math.max(size.x, size.y, size.z, 0.001)
  model.scale.setScalar((3.5 / longest) * ARWING_FIT.scale)
  const tintColor = tint != null ? new THREE.Color(tint) : null
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return
    child.castShadow = true
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    child.material = mats.map((m0) => {
      const m = m0.clone()
      m.emissiveIntensity = 0.30
      if (m.map) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map }
      else if (!m.emissive || m.emissive.r + m.emissive.g + m.emissive.b === 0) {
        m.emissive = m.color ? m.color.clone() : new THREE.Color(0x8899aa)
      }
      if (tintColor) {
        if (m.color) m.color.lerp(tintColor, 0.5)
        m.emissive = (m.emissive || new THREE.Color(0xffffff)).clone().lerp(tintColor, 0.5)
      }
      m.needsUpdate = true
      return m
    })
    if (child.material.length === 1) child.material = child.material[0]
  })
  return model
}

export default function Ship() {
  const gltf = useGLTF('./models/arwing.glb')

  const group = useMemo(() => {
    const ship = new THREE.Group()
    G.engineGlows = []
    try {
      ship.add(buildArwingModel(gltf.scene))
    } catch (e) {
      ship.add(buildShipFallback())
    }

    // 双発エンジングロー（後方に2つ、シアン加算合成）
    const engMat = new THREE.MeshBasicMaterial({
      color: 0x39f6ff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    ;[[-0.28, -0.08], [0.28, -0.08]].forEach(([ox, oy]) => {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), engMat.clone())
      glow.position.set(ox * ARWING_FIT.scale, oy * ARWING_FIT.scale, 1.1 * ARWING_FIT.scale)
      ship.add(glow)
      G.engineGlows.push(glow)
    })

    ship.position.set(0, C.startAltitude, 200) // initFlight と同じ開始位置
    return ship
  }, [gltf])

  useEffect(() => {
    G.ship = group
  }, [group])

  return <primitive object={group} />
}
