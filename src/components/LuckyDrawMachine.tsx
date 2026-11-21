import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './LuckyDrawMachine.css'

/**
 * EventFlow Lucky Draw — first construction pass.
 * GitHub Pages deployment verification trigger: 2026-11-21.
 * Scene units are inches. The enclosure is a 10 × 10 × 10 inch acrylic cube.
 * The scene is deliberately limited to the box and its right-side lever.
 */
export default function LuckyDrawMachine({ totalNames = 0 }: { totalNames?: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const counterTargetRef = useRef(Math.max(0, Math.floor(totalNames)))

  useEffect(() => {
    counterTargetRef.current = Math.max(0, Math.floor(totalNames))
  }, [totalNames])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const hostElement = host

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f2f4f7')

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    // Elevated three-quarter view: above the object, with the right face visible.
    camera.position.set(13, 22.8, 13)
    camera.lookAt(0, 4.8, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8b8, 2.0))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(8, 18, 12)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xdceaff, 1.25)
    fill.position.set(-10, 9, -8)
    scene.add(fill)

    const machine = new THREE.Group()
    scene.add(machine)

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xeaf6ff,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.48,
      thickness: 0.08,
      transparent: true,
      opacity: 0.27,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glassEdge = new THREE.LineBasicMaterial({
      color: 0xc8e4f5,
      transparent: true,
      opacity: 0.72,
    })

    const size = 10
    const thickness = 0.075
    const half = size / 2

    function addPanel(width: number, height: number, depth: number, x: number, y: number, z: number) {
      const geometry = new THREE.BoxGeometry(width, height, depth)
      const panel = new THREE.Mesh(geometry, glass)
      panel.position.set(x, y, z)
      panel.renderOrder = 2
      machine.add(panel)

      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), glassEdge)
      outline.position.copy(panel.position)
      outline.renderOrder = 3
      machine.add(outline)
    }

    // Six separate acrylic panels; no opaque frame or decorative trim.
    addPanel(size, thickness, size, 0, thickness / 2, 0) // bottom
    addPanel(size, thickness, size, 0, size - thickness / 2, 0) // lid
    addPanel(size, size, thickness, 0, half, half) // front
    addPanel(size, size, thickness, 0, half, -half) // rear
    addPanel(thickness, size, size, -half, half, 0) // left
    addPanel(thickness, size, size, half, half, 0) // right

    // Compact front-mounted name counter: dark metal housing with a red LED-style ticker.
    const counter = new THREE.Group()
    counter.position.set(0, 1.45, half + 0.16)
    machine.add(counter)

    const counterHousing = new THREE.Mesh(
      new THREE.BoxGeometry(3.05, 1.22, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x202832, metalness: 0.78, roughness: 0.3 }),
    )
    counter.add(counterHousing)

    const counterBezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.78, 0.91, 0.055),
      new THREE.MeshStandardMaterial({ color: 0x090e14, metalness: 0.35, roughness: 0.22 }),
    )
    counterBezel.position.z = 0.15
    counter.add(counterBezel)

    const counterCanvas = document.createElement('canvas')
    counterCanvas.width = 512
    counterCanvas.height = 160
    const counterContext = counterCanvas.getContext('2d')
    const counterTexture = new THREE.CanvasTexture(counterCanvas)
    counterTexture.colorSpace = THREE.SRGBColorSpace
    const counterScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.55, 0.72),
      new THREE.MeshBasicMaterial({ map: counterTexture, toneMapped: false }),
    )
    counterScreen.position.z = 0.185
    counter.add(counterScreen)

    function paintCounter(value: number) {
      if (!counterContext) return
      counterContext.fillStyle = '#080b0f'
      counterContext.fillRect(0, 0, 512, 160)
      counterContext.fillStyle = '#8d9aaa'
      counterContext.font = '700 22px Arial, sans-serif'
      counterContext.textAlign = 'left'
      counterContext.fillText('NAME COUNTER', 24, 31)
      counterContext.fillStyle = '#ff263c'
      counterContext.shadowColor = '#ff1b35'
      counterContext.shadowBlur = 14
      counterContext.font = '900 94px "Courier New", monospace'
      counterContext.textAlign = 'center'
      counterContext.textBaseline = 'middle'
      counterContext.fillText(String(value).padStart(3, '0'), 256, 101)
      counterContext.shadowBlur = 0
      counterTexture.needsUpdate = true
    }
    paintCounter(0)

    const counterScrewMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, metalness: 0.9, roughness: 0.2 })
    for (const x of [-1.39, 1.39]) {
      for (const y of [-0.48, 0.48]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 16), counterScrewMaterial)
        screw.rotation.x = Math.PI / 2
        screw.position.set(x, y, 0.17)
        counter.add(screw)
      }
    }

    // One restrained mechanical lever, mounted directly to the right acrylic wall.
    const lever = new THREE.Group()
    lever.position.set(half + 0.13, 5.1, 0)
    machine.add(lever)

    const metal = new THREE.MeshStandardMaterial({
      color: 0x8d98a5,
      metalness: 0.88,
      roughness: 0.23,
    })
    const polishedMetal = new THREE.MeshStandardMaterial({
      color: 0xd9e0e7,
      metalness: 0.94,
      roughness: 0.14,
    })
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x56616d,
      metalness: 0.82,
      roughness: 0.28,
    })

    // Flat mounting boss on the outside of the right wall.
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.2, 48), darkMetal)
    mount.rotation.z = Math.PI / 2
    mount.position.x = 0.02
    lever.add(mount)

    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.28, 40), polishedMetal)
    pivot.rotation.z = Math.PI / 2
    pivot.position.x = 0.18
    lever.add(pivot)

    // Lever arm rises vertically from its pivot. It remains static in this first preview.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.14, 3.25, 24), metal)
    arm.position.set(0.34, 1.72, 0)
    lever.add(arm)

    const grip = new THREE.Mesh(
      new THREE.SphereGeometry(0.43, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0x303943, metalness: 0.35, roughness: 0.24 }),
    )
    grip.position.set(0.34, 3.42, 0)
    lever.add(grip)

    // Neutral ground plane for contact shadow and scale; not part of the machine.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.14 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.015
    floor.receiveShadow = true
    scene.add(floor)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0.35, 4.8, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 12
    controls.maxDistance = 42
    controls.maxPolarAngle = Math.PI * 0.48
    controls.update()

    function resize() {
      const width = Math.max(hostElement.clientWidth, 1)
      const height = Math.max(hostElement.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(hostElement)
    resize()

    let frame = 0
    let shownCount = 0
    let countFrom = 1
    let countTo = counterTargetRef.current
    let countStartedAt = performance.now()
    let lastTarget = countTo
    const render = () => {
      const nextTarget = counterTargetRef.current
      if (nextTarget !== lastTarget) {
        lastTarget = nextTarget
        countFrom = 1
        countTo = nextTarget
        countStartedAt = performance.now()
      }
      const progress = Math.min(1, Math.max(0, (performance.now() - countStartedAt) / 1900))
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextCount = countTo > 0 ? Math.max(1, Math.floor(countFrom + (countTo - countFrom) * eased)) : 0
      if (nextCount !== shownCount) {
        shownCount = nextCount
        paintCounter(shownCount)
      }
      controls.update()
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }
    render()

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      scene.traverse((object: { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> }) => {
        object.geometry?.dispose()
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
        materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <section className="ld-machine-preview" aria-label="Lucky Draw acrylic box 3D prototype">
      <div className="ld-machine-preview-head">
        <div>
          <span className="ld-machine-kicker">LUCKY DRAW · 3D CONSTRUCTION</span>
          <h2>Acrylic Box — Prototype 01</h2>
          <p>10 × 10 × 10 inch transparent acrylic enclosure with a single right-side lever.</p>
        </div>
        <span className="ld-machine-status">GEOMETRY PREVIEW</span>
      </div>
      <div className="ld-machine-stage" ref={hostRef}>
        <span className="ld-machine-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span>
      </div>
      <div className="ld-machine-preview-footer">
        <div>
          <strong>Three.js scene</strong>
          <span>Real-time 3D geometry · No rendered-image assets</span>
        </div>
        <span className="ld-machine-units">DIMENSIONS IN INCHES</span>
      </div>
    </section>
  )
}
