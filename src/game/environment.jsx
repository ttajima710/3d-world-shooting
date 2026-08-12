// ===========================================================================
// 環境一式（要件定義書 F-2）: ステージ出し分けの入口。
// 草原ステージ: HDRI空（＋フォールバック）、太陽光＋影、地面（草PBR）、
// 木（InstancedMesh）、山の遠景、フォグ。宇宙ステージは environmentSpace.jsx。
// ===========================================================================
import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { G } from './state.js'
import { CONFIG as C } from './config.js'
import { useGameStore } from '../store/gameStore.js'
import SpaceStage from './environmentSpace.jsx'

// 山との衝突レイキャストを高速化（BVH。dreiの依存として同梱済み）
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

// ---- 空: HDRIを読み込み、失敗したら宇宙風フォールバックへ自動切替 ----
function Sky() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let disposed = false
    let tex = null
    let stars = null
    scene.fog = new THREE.Fog(C.fogColor, C.fogNear, C.fogFar)
    new RGBELoader().load(
      './env/sky.hdr',
      (t) => {
        if (disposed) { t.dispose(); return }
        tex = t
        tex.mapping = THREE.EquirectangularReflectionMapping
        scene.background = tex
        scene.environment = tex // HDRIを環境光としても使う
      },
      undefined,
      () => { if (!disposed) stars = applyFallbackSky(scene) },
    )
    return () => {
      // ステージ切替で背景・環境光・フォグ・星を持ち越さない
      disposed = true
      if (tex) tex.dispose()
      if (scene.background === tex) scene.background = null
      if (scene.environment === tex) scene.environment = null
      if (stars) { scene.remove(stars); stars.geometry.dispose(); stars.material.dispose() }
      scene.fog = null
    }
  }, [scene])
  return null
}

// HDRIが無い/読めない場合: 宇宙紺の背景 + 濃いめのフォグ + 星
function applyFallbackSky(scene) {
  scene.background = new THREE.Color(0x0a0e2a)
  scene.fog = new THREE.Fog(0x0a0e2a, 300, 1400)
  const N = 2000
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1600 + Math.random() * 900)
    pos.set([v.x, Math.abs(v.y), v.z], i * 3) // 星は上半球のみ
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, fog: false,
  }))
  scene.add(stars)
  return stars
}

// ---- 太陽光（DirectionalLight 1灯 + 影）。GameTickが機体に追従させる ----
function Sun() {
  const ref = useRef()
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    if (!ref.current) return
    ref.current.target = target
    // shadow-camera-* プロパティは行列を自動再計算しないため明示的に更新（影が出ない典型原因）
    ref.current.shadow.camera.updateProjectionMatrix()
    G.sunLight = ref.current
    G.sunTarget = target
    return () => { G.sunLight = null; G.sunTarget = null } // 宇宙では太陽追従なし
  }, [target])
  return (
    <>
      <directionalLight
        ref={ref}
        color={0xfff5e0}
        intensity={2.2} // HDRIの環境光が強く、1.0では影がほぼ見えないため強め
        position={[250, 400, 150]}
        castShadow
        shadow-mapSize-width={C.shadowMapSize}
        shadow-mapSize-height={C.shadowMapSize}
        shadow-camera-left={-C.shadowRange}
        shadow-camera-right={C.shadowRange}
        shadow-camera-top={C.shadowRange}
        shadow-camera-bottom={-C.shadowRange}
        shadow-camera-near={1}
        shadow-camera-far={1500}
        shadow-bias={-0.0005}
      />
      <primitive object={target} />
      {/* HDRIが読めない場合の最低限の環境光 */}
      <ambientLight intensity={0.25} />
      {/* 太陽の反対側（逆光）の山が真っ黒に潰れるのを防ぐ回り込み光。
          空色を上から、地面色を下から弱く当てて陰面の形が読めるようにする */}
      <hemisphereLight args={[0xbcd8f0, 0x6b6a52, 0.55]} />
    </>
  )
}

// ---- 地面: 草PBRテクスチャ（色/凹凸/粗さ）の円盤。影を受ける ----
function Ground() {
  const [diff, nor, rough] = useTexture([
    './textures/grass_diff.webp',
    './textures/grass_nor.webp',
    './textures/grass_rough.webp',
  ])
  useMemo(() => {
    for (const t of [diff, nor, rough]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(C.groundTexRepeat, C.groundTexRepeat)
    }
    diff.colorSpace = THREE.SRGBColorSpace
  }, [diff, nor, rough])
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <circleGeometry args={[C.groundRadius, 96]} />
      {/* envMapIntensity低め: HDRI環境光が強すぎると影が washed out して見えなくなる */}
      <meshStandardMaterial map={diff} normalMap={nor} roughnessMap={rough} envMapIntensity={0.4} />
    </mesh>
  )
}

// ---- 木: GLB内の各メッシュを InstancedMesh 化して大量配置（draw call削減） ----
function makePlacements(count, seedOffset) {
  const out = []
  for (let i = 0; i < count; i++) {
    // 面積が均一になる分布で中心リング外に配置
    const t = Math.random()
    const r = Math.sqrt(
      C.treeMinRadius * C.treeMinRadius +
      t * (C.treeMaxRadius * C.treeMaxRadius - C.treeMinRadius * C.treeMinRadius),
    )
    const a = Math.random() * Math.PI * 2 + seedOffset
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rot: Math.random() * Math.PI * 2, scale: 0.7 + Math.random() * 0.7 })
  }
  return out
}

function buildTreeInstances(scene, placements) {
  // tree1/tree2.glb はルートノードにX軸-90°回転が焼き込まれており横倒しになる。
  // ラッパーGroupで直立補正してから計測・インスタンス化する（再実行しても二重回転しない）
  const wrap = new THREE.Group()
  wrap.rotation.x = C.treeFixRotX
  wrap.add(scene)
  wrap.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(wrap)
  const size = new THREE.Vector3()
  box.getSize(size)
  const norm = C.treeHeight / Math.max(size.y, 0.001) // 高さを基準に自動スケール
  const yBase = -box.min.y * norm                      // 足元を地面(y=0)に合わせる

  const meshes = []
  scene.traverse((c) => {
    if (!c.isMesh) return
    if (c.material) c.material.envMapIntensity = 0.5 // 地面と同様、影が見える明るさに抑える
    meshes.push(c)
  })

  const place = new THREE.Matrix4()
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const eul = new THREE.Euler()
  const s = new THREE.Vector3()
  const pos = new THREE.Vector3()

  return meshes.map((mesh) => {
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length)
    placements.forEach((p, i) => {
      q.setFromEuler(eul.set(0, p.rot, 0))
      s.setScalar(norm * p.scale)
      pos.set(p.x, yBase * p.scale, p.z)
      place.compose(pos, q, s)
      m4.copy(place).multiply(mesh.matrixWorld) // GLB内部の変換を焼き込む
      inst.setMatrixAt(i, m4)
    })
    inst.instanceMatrix.needsUpdate = true
    inst.castShadow = true
    return inst
  })
}

function Trees() {
  const g1 = useGLTF('./models/tree1.glb')
  const g2 = useGLTF('./models/tree2.glb')
  const instances = useMemo(() => {
    const half = Math.floor(C.treeCount / 2)
    return [
      ...buildTreeInstances(g1.scene, makePlacements(half, 0)),
      ...buildTreeInstances(g2.scene, makePlacements(C.treeCount - half, 1.7)),
    ]
  }, [g1, g2])
  return (
    <group>
      {instances.map((m, i) => <primitive key={i} object={m} />)}
    </group>
  )
}

// ---- 山の遠景: 全幅を目標値へ自動スケールし、基部を沈めて稜線だけ見せる ----
function Mountains() {
  const g = useGLTF('./models/mountains.glb')
  const obj = useMemo(() => {
    const m = g.scene.clone(true)
    m.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(m)
    const size = new THREE.Vector3()
    box.getSize(size)
    const scale = C.mountainSpan / Math.max(size.x, size.z, 0.001)
    m.scale.setScalar(scale)
    m.position.y = -box.min.y * scale - size.y * scale * C.mountainSink
    // 雪山が真っ白すぎて照準・敵機が埋もれるため、一段落ち着いた色に下げる
    m.traverse((c) => {
      if (!c.isMesh || !c.material) return
      const mats = Array.isArray(c.material) ? c.material : [c.material]
      c.material = mats.map((m0) => {
        const mm = m0.clone()
        if (mm.color) mm.color.multiplyScalar(C.mountainTint)
        mm.needsUpdate = true
        return mm
      })
      if (c.material.length === 1) c.material = c.material[0]
    })
    return m
  }, [g])

  // 衝突判定用に登録（BVH構築は初回のみ・ロード画面の裏で一度だけ）
  useEffect(() => {
    obj.updateMatrixWorld(true)
    obj.traverse((c) => {
      if (c.isMesh && c.geometry && !c.geometry.boundsTree) c.geometry.computeBoundsTree()
    })
    G.colliders = obj
    return () => { G.colliders = null }
  }, [obj])

  return <primitive object={obj} />
}

// heavy=false のとき、木と山（合計9.6MB）を読み込まない。
// タイトル画面では空と地面だけを見せ、重いモデルは出撃を決めてから読む
// （宇宙ステージを選んだ人は最後まで一度もダウンロードしない）。
function GrassStage({ heavy }) {
  return (
    <>
      <Sky />
      <Sun />
      <Ground />
      {/* 読み込み中に機体まで消えないよう、重いモデルだけ独立したSuspenseで囲う */}
      <Suspense fallback={null}>
        {heavy && <Trees />}
        {heavy && <Mountains />}
      </Suspense>
    </>
  )
}

// ステージ出し分け（選択していない方はマウントしない＝メモリ節約・通信量節約）
export default function Environment3D() {
  const stage = useGameStore((s) => s.stage)
  const screen = useGameStore((s) => s.screen)
  // タイトル画面ではどちらのステージも読み込まない（出撃を決めてから必要な方だけ落とす）。
  // 一度でも出撃したら、以後はタイトルへ戻っても外さない（再ダウンロードを避ける）
  const loaded = useRef({ grass: false, space: false })
  if (screen !== 'start') loaded.current[stage === 'space' ? 'space' : 'grass'] = true
  if (stage === 'space') return loaded.current.space ? <SpaceStage /> : null
  return loaded.current.grass ? <GrassStage heavy /> : null
}
