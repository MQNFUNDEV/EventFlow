import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './LuckyDrawMachine.css'

export type BoxPhase = 'idle' | 'loading' | 'loaded' | 'cranking' | 'shaking' | 'reveal'
type Props = { totalNames?: number; categoryLabel?: string; phase?: BoxPhase; startedAt?: number; animationId?: number }

export default function LuckyDrawMachine({ totalNames = 0, categoryLabel = 'No category selected', phase = 'idle', startedAt = 0, animationId = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ totalNames, categoryLabel, phase, startedAt, animationId })
  useEffect(() => { propsRef.current = { totalNames, categoryLabel, phase, startedAt, animationId } }, [totalNames, categoryLabel, phase, startedAt, animationId])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const hostElement = host
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f2f4f7')
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8b8, 2))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(8, 18, 12); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key)
    const fill = new THREE.DirectionalLight(0xdceaff, 1.25)
    fill.position.set(-10, 9, -8); scene.add(fill)
    const machine = new THREE.Group(); scene.add(machine)
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, metalness: 0, roughness: .08, transmission: .42, thickness: .08, transparent: true, opacity: .22, clearcoat: 1, clearcoatRoughness: .06, side: THREE.DoubleSide, depthWrite: false })
    const edge = new THREE.LineBasicMaterial({ color: 0xc8e4f5, transparent: true, opacity: .72 })
    const size = 10, half = 5, thick = .075
    function panel(w:number,h:number,d:number,x:number,y:number,z:number) {
      const g = new THREE.BoxGeometry(w,h,d), m = new THREE.Mesh(g,glass)
      m.position.set(x,y,z); m.renderOrder=2; machine.add(m)
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(g),edge)
      outline.position.copy(m.position); outline.renderOrder=3; machine.add(outline)
    }
    panel(size,thick,size,0,thick/2,0)
    // Split lid panels leave a real narrow feed aperture through the top.
    const lidY=size-thick/2
    panel(size,thick,(size-.4)/2,0,lidY,-(size+.4)/4)
    panel(size,thick,(size-.4)/2,0,lidY,(size+.4)/4)
    panel((size-2.15)/2,thick,.4,-(size+2.15)/4,lidY,0)
    panel((size-2.15)/2,thick,.4,(size+2.15)/4,lidY,0)
    panel(size,size,thick,0,half,half)
    panel(size,size,thick,0,half,-half)
    panel(thick,size,size,-half,half,0)
    panel(thick,size,size,half,half,0)
    // Narrow feed slot in the lid, with a raised guide lip.
    // The slot remains open so each paper slip can pass through the lid.
    for (const z of [-.22,.22]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(2.35,.12,.055),new THREE.MeshStandardMaterial({color:0x778493,metalness:.75,roughness:.25})); lip.position.set(0,10.1,z); machine.add(lip) }

    // Front counter: category name plus a large red paper tally.
    const counter = new THREE.Group(); counter.position.set(0,1.5,5.16); machine.add(counter)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(3.8,1.48,.25),new THREE.MeshStandardMaterial({color:0x202832,metalness:.78,roughness:.3})); counter.add(housing)
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(3.52,1.2,.055),new THREE.MeshStandardMaterial({color:0x090e14,metalness:.35,roughness:.22})); bezel.position.z=.15; counter.add(bezel)
    const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=210
    const ctx = canvas.getContext('2d'); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.28,1.05),new THREE.MeshBasicMaterial({map:texture,toneMapped:false})); screen.position.z=.185; counter.add(screen)
    function paint(label:string,count:number) {
      if(!ctx)return
      ctx.fillStyle='#080b0f';ctx.fillRect(0,0,640,210)
      ctx.fillStyle='#aab5c2';ctx.font='800 25px Arial';ctx.textAlign='left';ctx.fillText('NAME COUNTER',24,38)
      ctx.fillStyle='#fff';ctx.font='700 31px Arial';ctx.textAlign='center'
      const trimmed=label.length>23?label.slice(0,21)+'…':label
      ctx.fillText(trimmed.toUpperCase(),320,82)
      ctx.fillStyle='#ff263c';ctx.shadowColor='#ff1b35';ctx.shadowBlur=16;ctx.font='900 104px "Courier New",monospace';ctx.fillText(String(count).padStart(3,'0'),320,166);ctx.shadowBlur=0
      texture.needsUpdate=true
    }
    paint(propsRef.current.categoryLabel,0)

    // Paper slips, pre-built as real meshes. They accumulate inside the transparent cube.
    const paperMat = new THREE.MeshStandardMaterial({color:0xfff4d9,roughness:.88,side:THREE.DoubleSide})
    const papers: Array<{ visible: boolean; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void } }> = []
    const paperCount=120
    for(let i=0;i<paperCount;i++){
      const paper=new THREE.Mesh(new THREE.PlaneGeometry(.78,.38),paperMat.clone())
      paper.rotation.set(-Math.PI/2+(i%5)*.025,((i*17)%9)*.13,((i*7)%11)*.025)
      paper.position.set(((i*37)%79)/10-3.95,.28+Math.floor(i/10)*.23,((i*23)%79)/10-3.95)
      paper.visible=false; machine.add(paper); papers.push(paper)
    }
    // Rain stream above the slot. Slips cycle through the aperture and land in the box.
    const falling: Array<{ visible: boolean; position: THREE.Vector3; rotation: THREE.Euler }> = []
    for(let i=0;i<18;i++){
      const slip=new THREE.Mesh(new THREE.PlaneGeometry(.72,.34),paperMat)
      slip.position.set(((i%5)-2)*.36,11+(i%6)*.8,((i%3)-1)*.18)
      slip.rotation.set(-Math.PI/2,0,(i%4)*.35); slip.visible=false; machine.add(slip); falling.push(slip)
    }

    // Right-side lever and pivot.
    const lever = new THREE.Group(); lever.position.set(5.13,5.1,0); machine.add(lever)
    const metal=new THREE.MeshStandardMaterial({color:0x8d98a5,metalness:.88,roughness:.23})
    const polished=new THREE.MeshStandardMaterial({color:0xd9e0e7,metalness:.94,roughness:.14})
    const dark=new THREE.MeshStandardMaterial({color:0x56616d,metalness:.82,roughness:.28})
    const mount=new THREE.Mesh(new THREE.CylinderGeometry(.68,.68,.2,48),dark);mount.rotation.z=Math.PI/2;mount.position.x=.02;lever.add(mount)
    const pivot=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.28,40),polished);pivot.rotation.z=Math.PI/2;pivot.position.x=.18;lever.add(pivot)
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(.105,.14,3.25,24),metal);arm.position.set(.34,1.72,0);lever.add(arm)
    const grip=new THREE.Mesh(new THREE.SphereGeometry(.43,32,24),new THREE.MeshStandardMaterial({color:0x303943,metalness:.35,roughness:.24}));grip.position.set(.34,3.42,0);lever.add(grip)

    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.14}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor)
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(.35,4.8,0);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=12;controls.maxDistance=42;controls.maxPolarAngle=Math.PI*.48;controls.update()
    function resize(){const w=Math.max(hostElement.clientWidth,1),h=Math.max(hostElement.clientHeight,1);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
    const observer=new ResizeObserver(resize);observer.observe(host);resize()
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame=0
    const render=()=>{
      const p=propsRef.current, now=performance.now()
      const elapsed=p.phase==='loading'&&p.startedAt?Math.max(0,Date.now()-p.startedAt):0
      const duration=14000
      const progress=p.phase==='loading'?Math.min(1,elapsed/duration):p.phase==='idle'?0:1
      const count=p.phase==='loading'?Math.min(p.totalNames,Math.floor(progress*p.totalNames)):p.phase==='idle'?0:p.totalNames
      paint(p.categoryLabel,count)
      const visiblePapers=Math.min(paperCount,Math.round((count/Math.max(p.totalNames,1))*paperCount))
      papers.forEach((paper,i)=>{paper.visible=i<visiblePapers;if(p.phase==='shaking'){paper.position.y=.28+Math.abs(Math.sin(now/85+i))*((i%4)*.09+.04)}else paper.position.y=.28+Math.floor(i/18)*.055})
      falling.forEach((slip,i)=>{
        slip.visible=p.phase==='loading'&&progress<1
        if(slip.visible){const cycle=((elapsed/850)+(i/18))%1;slip.position.y=11.4-cycle*2.1;slip.position.x=Math.sin(now/260+i)*.24;slip.position.z=Math.cos(now/300+i)*.12;slip.rotation.set(-Math.PI/2+Math.sin(now/160+i)*.45,Math.cos(now/220+i)*.4,Math.sin(now/180+i)*.5)}
      })
      const crank=p.phase==='cranking'||p.phase==='shaking'||p.phase==='reveal'
      lever.rotation.z=crank?(reduced?-.45:-.45+Math.sin(now/115)*.2):0
      if(p.phase==='shaking'){machine.position.x=Math.sin(now/28)*.055;machine.position.z=Math.cos(now/31)*.045}else{machine.position.x=0;machine.position.z=0}
      controls.update();renderer.render(scene,camera);frame=window.requestAnimationFrame(render)
    }
    render()
    return()=>{window.cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse((object: { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> }) => { object.geometry?.dispose(); const mats = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []; mats.forEach((material) => material.dispose()) });renderer.dispose();renderer.domElement.remove()}
  },[])
  return <section className="ld-machine-preview" aria-label="Lucky Draw acrylic box 3D prototype">
    <div className="ld-machine-preview-head"><div><span className="ld-machine-kicker">LUCKY DRAW · 3D MACHINE</span><h2>Acrylic Name Draw Box</h2><p>Paper slips feed through the top slot and collect inside the transparent enclosure.</p></div><span className="ld-machine-status">{phase==='loading'?'LOADING PAPERS':phase==='loaded'?'PAPERS LOADED':phase==='cranking'?'PULLING LEVER':phase==='shaking'?'MIXING NAMES':phase==='reveal'?'WINNER SELECTED':'BOX READY'}</span></div>
    <div className="ld-machine-stage" ref={hostRef}><span className="ld-machine-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span></div>
    <div className="ld-machine-preview-footer"><div><strong>{categoryLabel}</strong><span>{phase==='loading'?'Feeding name slips into the box':phase==='shaking'?'Mixing the paper slips':phase==='idle'?'Reset and ready for the next category':'Lucky draw machine active'}</span></div><span className="ld-machine-units">{totalNames.toLocaleString()} NAMES</span></div>
  </section>
}
