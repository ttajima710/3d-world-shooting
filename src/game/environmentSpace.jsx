// ===========================================================================
// 宇宙ステージ（第3フェーズ）。
// - 背景: HDRI_SPACE.glb（宇宙の絵が貼られた球体モデル）を大きく広げて内側から見せ、
//   テクスチャは環境光（scene.environment）としても使う
// - 隕石: asteroid.glb を InstancedMesh で約50個ランダム配置
// - 衛星: ハッブル(Satellite1)・ISS(Satellite2) を少なめに固定配置、ゆっくり自転
// - 隕石・衛星は G.colliders に登録 → 山と同じ「はじかれ判定」（flight.js）
// - フォグなし・影なし（宇宙に地面がないため）
// ===========================================================================
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { G } from './state.js'
import { CONFIG as C, STAGES } from './config.js'

// ---- 背景の宇宙球 + 環境光 ----
function SpaceSky() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const g = useGLTF('./models/space/SPACE2_hdri.glb')

  const { sphere, envTex } = useMemo(() => {
    const m = g.scene.clone(true)
    m.updateMatrixWorld(true)
    // 中心を原点に合わせ、フィールド全体を包む大きさへ拡大
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = (C.spaceSkyRadius * 2) / Math.max(size.x, size.y, size.z, 0.001)
    m.scale.setScalar(scale)
    m.position.copy(center).multiplyScalar(-scale)

    // ライティング・フォグの影響を受けない「絵」として描く（内側から見えるよう両面）
    // ※このGLBは宇宙の絵を emissiveMap（発光テクスチャ）として持っている
    let tex = null
    m.traverse((c) => {
      if (!c.isMesh) return
      const map = (c.material && (c.material.map || c.material.emissiveMap)) || null
      if (map && !tex) tex = map
      c.material = new THREE.MeshBasicMaterial({
        map, side: THREE.DoubleSide, fog: false, depthWrite: false,
      })
      c.renderOrder = -1      // 最初に描いて他の全てを手前に
      c.frustumCulled = false // 巨大球がカリングで消えないように
    })
    return { sphere: m, envTex: tex }
  }, [g])

  useEffect(() => {
    scene.fog = null // 宇宙にフォグはなし
    scene.background = new THREE.Color(0x000308)
    // 宇宙は元から暗いので露出は標準に戻す（草原は白飛び防止で C.exposureGrass）
    gl.toneMappingExposure = C.exposureSpace
    let env = null
    if (envTex) {
      // 宇宙テクスチャを環境光として利用（機体・衛星のライティング用）
      env = envTex.clone()
      env.mapping = THREE.EquirectangularReflectionMapping
      env.needsUpdate = true
      scene.environment = env
    }
    return () => {
      if (scene.environment === env) scene.environment = null
      if (env) env.dispose()
      scene.background = null
      gl.toneMappingExposure = C.exposureGrass
    }
  }, [scene, envTex, gl])

  return <primitive object={sphere} />
}

// ---- 隕石: 位置・向き・大きさをランダムに散らして InstancedMesh 化 ----
function makeAsteroidPlacements() {
  const minAlt = STAGES.space.minAltitude + 30
  const maxAlt = STAGES.space.maxAltitude - 30
  const start = new THREE.Vector3(0, STAGES.space.startAltitude, 200) // 開始地点は空ける
  const out = []
  let guard = 0
  while (out.length < C.asteroidCount && guard++ < C.asteroidCount * 20) {
    const a = Math.random() * Math.PI * 2
    // 面積が均一になる分布（木の配置と同じ考え方）
    const t = Math.random()
    const r = Math.sqrt(
      C.asteroidMinRadius * C.asteroidMinRadius +
      t * (C.asteroidMaxRadius * C.asteroidMaxRadius - C.asteroidMinRadius * C.asteroidMinRadius),
    )
    const p = new THREE.Vector3(
      Math.cos(a) * r,
      minAlt + Math.random() * (maxAlt - minAlt),
      Math.sin(a) * r,
    )
    if (p.distanceTo(start) < 120) continue // 出現直後に衝突しないように
    out.push({
      pos: p,
      rot: new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
      scale: 0.6 + Math.random() * 1.6,
    })
  }
  return out
}

function Asteroids() {
  const g = useGLTF('./models/space/asteroid.glb')
  const instances = useMemo(() => {
    const scene = g.scene
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const norm = C.asteroidSize / Math.max(size.x, size.y, size.z, 0.001)

    const meshes = []
    scene.traverse((c) => { if (c.isMesh) meshes.push(c) })

    const placements = makeAsteroidPlacements()
    // 自動テスト用: 隕石の座標一覧（devのみ）
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__asteroids = placements.map((p) => p.pos.toArray().map((v) => Math.round(v)))
    }
    const place = new THREE.Matrix4()
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()

    return meshes.map((mesh) => {
      if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree() // はじかれ判定用
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length)
      placements.forEach((p, i) => {
        q.setFromEuler(p.rot)
        s.setScalar(norm * p.scale)
        place.compose(p.pos, q, s)
        m4.copy(place).multiply(mesh.matrixWorld) // GLB内部の変換を焼き込む
        inst.setMatrixAt(i, m4)
      })
      inst.instanceMatrix.needsUpdate = true
      return inst
    })
  }, [g])
  return <>{instances.map((m, i) => <primitive key={i} object={m} />)}</>
}

// ---- 衛星: フィールド各所に散らす目印（ISS=Satellite2 / ハッブル=Satellite1）。ゆっくり自転 ----
// モデルは2種類。位置・大きさ・向きを変えて5基配置する（idはkeyの重複回避用）
const SATELLITES = [
  { id: 'iss-1', url: './models/space/Satellite2.glb', pos: [-260, 90, -480], size: 64 },
  { id: 'iss-2', url: './models/space/Satellite2.glb', pos: [520, 40, -220], size: 48, spin: -0.04 },
  { id: 'hubble-1', url: './models/space/Satellite1.glb', pos: [420, -60, 260], size: 30 },
  { id: 'hubble-2', url: './models/space/Satellite1.glb', pos: [-360, -140, 340], size: 24, spin: 0.08 },
  { id: 'hubble-3', url: './models/space/Satellite1.glb', pos: [120, 200, 560], size: 26, spin: -0.06 },
]

function Satellite({ url, pos, size, spin = C.satelliteSpin }) {
  const g = useGLTF(url)
  const obj = useMemo(() => {
    const m = g.scene.clone(true)
    m.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(m)
    const dims = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = size / Math.max(dims.x, dims.y, dims.z, 0.001)
    m.scale.setScalar(scale)
    m.position.copy(center).multiplyScalar(-scale) // 自転の軸が中心を通るように
    m.rotation.y = Math.random() * Math.PI * 2     // 同じモデルでも初期向きを散らす
    m.traverse((c) => {
      if (c.isMesh && c.geometry && !c.geometry.boundsTree) c.geometry.computeBoundsTree()
    })
    const holder = new THREE.Group()
    holder.add(m)
    holder.position.set(pos[0], pos[1], pos[2])
    return holder
  }, [g, pos, size])
  useFrame((_, dt) => { obj.rotation.y += spin * Math.min(dt, 0.05) })
  return <primitive object={obj} />
}

export default function SpaceStage() {
  const colRef = useRef()
  // 隕石＋衛星のグループを、はじかれ判定の対象として登録
  useEffect(() => {
    G.colliders = colRef.current
    return () => { G.colliders = null }
  }, [])
  return (
    <>
      <SpaceSky />
      {/* 影は使わない（受ける地面がない）。環境光は SpaceSky が設定 */}
      <directionalLight color={0xfff5e0} intensity={1.6} position={[300, 500, 200]} />
      <ambientLight intensity={0.35} />
      <group ref={colRef}>
        <Asteroids />
        {SATELLITES.map((s) => <Satellite key={s.id} {...s} />)}
      </group>
    </>
  )
}
