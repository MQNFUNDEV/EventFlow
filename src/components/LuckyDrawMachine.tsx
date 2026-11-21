import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './LuckyDrawMachine.css'

export type BoxPhase = 'idle' | 'loading' | 'loaded' | 'cranking' | 'shaking' | 'reveal'
export type MachineCameraView = { position: [number, number, number]; target: [number, number, number] }
type Props = { totalNames?: number; categoryLabel?: string; phase?: BoxPhase; startedAt?: number; animationId?: number; cameraView?: MachineCameraView | null; onCameraChange?: (view: MachineCameraView) => void; interactiveCamera?: boolean }

export default function LuckyDrawMachine({ totalNames = 0, categoryLabel = 'No category selected', phase = 'idle', startedAt = 0, animationId = 0, cameraView = null, onCameraChange, interactiveCamera = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ totalNames, categoryLabel, phase, startedAt, animationId, cameraView, onCameraChange, interactiveCamera })
  useEffect(() => { propsRef.current = { totalNames, categoryLabel, phase, startedAt, animationId, cameraView, onCameraChange, interactiveCamera } }, [totalNames, categoryLabel, phase, startedAt, animationId, cameraView, onCameraChange, interactiveCamera])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const hostElement = host
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f2f4f7')
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(7, 16, 23)
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
    const counter = new THREE.Group(); counter.position.set(0,1.62,5.16); machine.add(counter)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(4.65,1.82,.25),new THREE.MeshStandardMaterial({color:0x202832,metalness:.78,roughness:.3})); counter.add(housing)
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(4.34,1.52,.055),new THREE.MeshStandardMaterial({color:0x090e14,metalness:.35,roughness:.22})); bezel.position.z=.15; counter.add(bezel)
    const canvas = document.createElement('canvas'); canvas.width=720; canvas.height=260
    const ctx = canvas.getContext('2d'); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.08,1.32),new THREE.MeshBasicMaterial({map:texture,toneMapped:false})); screen.position.z=.185; counter.add(screen)
    function paint(label:string,count:number) {
      if(!ctx)return
      ctx.fillStyle='#080b0f';ctx.fillRect(0,0,720,260)
      ctx.fillStyle='#fff';ctx.textAlign='center'
      const trimmed=label.length>19?label.slice(0,17)+'…':label
      ctx.font='900 48px Arial';ctx.fillText(trimmed.toUpperCase(),360,76)
      ctx.fillStyle='#ff263c';ctx.shadowColor='#ff1b35';ctx.shadowBlur=18;ctx.font='900 148px "Courier New",monospace';ctx.fillText(String(count).padStart(3,'0'),360,238);ctx.shadowBlur=0
      texture.needsUpdate=true
    }
    paint(propsRef.current.categoryLabel,0)

    // Paper slips, pre-built as real meshes. They accumulate inside the transparent cube.
    const paperPalette = [0xc2410c,0xbe185d,0xb45309,0x1d4ed8,0x15803d,0x6d28d9,0xea580c,0x854d0e,0x0f766e,0x9f1239]
    const paperMaterials = paperPalette.map((color) => new THREE.MeshStandardMaterial({ color, roughness: .9, side: THREE.DoubleSide }))
    const papers: Array<{ visible: boolean; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void } }> = []
    const paperHomes: Array<{ x: number; y: number; z: number; rx: number; ry: number; rz: number }> = []
    const paperCount=1800
    const paperGeometry=new THREE.BoxGeometry(1.86,.12,1.86)
    // 25 slips per layer across the full floor. Each layer is independently
    // shuffled and jittered, so colours and edges never form repeating columns.
    const slots=Array.from({length:25},(_,index)=>({column:index%5,row:Math.floor(index/5)}))
    for(let i=0;i<paperCount;i++){
      const paper=new THREE.Mesh(paperGeometry,paperMaterials[Math.floor(Math.random()*paperMaterials.length)])
      const layer=Math.floor(i/25)
      const slotIndex=i%25
      if(slotIndex===0){
        // Shuffle each new layer independently.
        for(let j=slots.length-1;j>0;j--){
          const k=Math.floor(Math.random()*(j+1))
          const temp=slots[j];slots[j]=slots[k];slots[k]=temp
        }
      }
      const slot=slots[slotIndex]
      const yaw=Math.random()*Math.PI
      const projectedExtent=.93*(Math.abs(Math.cos(yaw))+Math.abs(Math.sin(yaw)))
      const maxCenter=half-thick-.12-projectedExtent
      const home={
        x:Math.max(-maxCenter,Math.min(maxCenter,(slot.column-2)*1.82+(Math.random()-.5)*.24)),
        y:.075+layer*.124,
        z:Math.max(-maxCenter,Math.min(maxCenter,(slot.row-2)*1.82+(Math.random()-.5)*.24)),
        rx:(Math.random()-.5)*.08,
        ry:yaw,
        rz:(Math.random()-.5)*.08,
      }
      // Every layer is constrained to the 10-unit enclosure; no stack can
      // grow through the lid or float above the acrylic walls.
      paper.position.set(home.x,10+Math.random()*2,home.z)
      paper.rotation.set(home.rx,home.ry,home.rz)
      paper.visible=false; machine.add(paper); papers.push(paper); paperHomes.push(home)
    }
    // Rain stream above the slot. Slips cycle through the aperture and land in the box.
    const falling: Array<{ visible: boolean; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void } }> = []
    for(let i=0;i<18;i++){
      const slip=new THREE.Mesh(new THREE.PlaneGeometry(.72,.42),paperMaterials[(i * 3 + 2) % paperMaterials.length])
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
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(.35,4.8,0);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=12;controls.maxDistance=42;controls.maxPolarAngle=Math.PI*.48;controls.enableRotate=interactiveCamera;controls.enableZoom=interactiveCamera;controls.enablePan=interactiveCamera;controls.update()
    let lastAppliedCamera=''
    controls.addEventListener('end',()=>{
      if(!propsRef.current.interactiveCamera||!propsRef.current.onCameraChange)return
      propsRef.current.onCameraChange({position:[camera.position.x,camera.position.y,camera.position.z],target:[controls.target.x,controls.target.y,controls.target.z]})
    })
    function resize(){const w=Math.max(hostElement.clientWidth,1),h=Math.max(hostElement.clientHeight,1);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
    const observer=new ResizeObserver(resize);observer.observe(host);resize()
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame=0
    let previousPhase: BoxPhase='idle'
    let crankStartedAt=0
    let lastFrameAt=performance.now()
    const paperVelocity=paperHomes.map(()=>new THREE.Vector3())
    let shakeWasActive=false
    const render=()=>{
      const p=propsRef.current, now=performance.now()
      const dt=Math.min(.04,Math.max(.001,(now-lastFrameAt)/1000));lastFrameAt=now
      if(p.cameraView){
        const signature=JSON.stringify(p.cameraView)
        if(signature!==lastAppliedCamera){camera.position.set(...p.cameraView.position);controls.target.set(...p.cameraView.target);controls.update();lastAppliedCamera=signature}
      }
      if(p.phase!==previousPhase){if(p.phase==='cranking')crankStartedAt=now;previousPhase=p.phase}
      const shakingNow=p.phase==='shaking'
      if(shakingNow&&!shakeWasActive)paperVelocity.forEach((v)=>v.set((Math.random()-.5)*5,(Math.random()-.5)*1.2,(Math.random()-.5)*5))
      shakeWasActive=shakingNow
      const elapsed=p.phase==='loading'&&p.startedAt?Math.max(0,Date.now()-p.startedAt):0
      const duration=14000
      const progress=p.phase==='loading'?Math.min(1,elapsed/duration):p.phase==='idle'?0:1
      const count=p.phase==='loading'?Math.min(p.totalNames,Math.floor(progress*p.totalNames)):p.phase==='idle'?0:p.totalNames
      paint(p.categoryLabel,count)
      const paperFeedProgress=p.phase==='loading'?Math.min(1,elapsed/(duration*.62)):1
      const visiblePapers=p.phase==='idle'?0:Math.min(paperCount,Math.round(paperFeedProgress*paperCount))
      papers.forEach((paper,i)=>{
        paper.visible=i<visiblePapers
        const home=paperHomes[i]
        const shaking=p.phase==='shaking'
        const velocity=paperVelocity[i]
        if(shaking){
          velocity.y-=9.8*dt
          paper.position.x+=velocity.x*dt
          paper.position.y+=velocity.y*dt
          paper.position.z+=velocity.z*dt
          velocity.x*=Math.pow(.94,dt*60);velocity.z*=Math.pow(.94,dt*60)
          const wallLimit=3.62
          if(paper.position.x>wallLimit){paper.position.x=wallLimit;velocity.x=-Math.abs(velocity.x)*.32}
          if(paper.position.x< -wallLimit){paper.position.x=-wallLimit;velocity.x=Math.abs(velocity.x)*.32}
          if(paper.position.z>wallLimit){paper.position.z=wallLimit;velocity.z=-Math.abs(velocity.z)*.32}
          if(paper.position.z< -wallLimit){paper.position.z=-wallLimit;velocity.z=Math.abs(velocity.z)*.32}
          if(paper.position.y<home.y){paper.position.y=home.y;velocity.y=Math.abs(velocity.y)*.16;velocity.x+=(Math.random()-.5)*.12;velocity.z+=(Math.random()-.5)*.12}
          if(paper.position.y>9.72){paper.position.y=9.72;velocity.y=-Math.abs(velocity.y)*.2}
        } else if(!shakeWasActive){
          paper.position.x+=(home.x-paper.position.x)*Math.min(1,dt*5)
          paper.position.y+=(home.y-paper.position.y)*Math.min(1,dt*5)
          paper.position.z+=(home.z-paper.position.z)*Math.min(1,dt*5)
        }
        // Gravity-driven feed: each slip drops from above the slot, then settles onto its pile layer.
        const releaseAt=(i/paperCount)*duration*.62
        const fallSeconds=Math.max(0,(elapsed-releaseAt)/1000)
        const gravityDrop=Math.max(0,10+((i%5)*.22)-.5*9.8*fallSeconds*fallSeconds)
        const settledY=Math.max(home.y,gravityDrop)
        const impactAge=Math.max(0,fallSeconds-Math.sqrt(Math.max(0,(10+((i%5)*.22)-home.y)/4.9)))
        const bounce=impactAge>0?Math.exp(-impactAge*7)*Math.sin(impactAge*18)*.055:0
        if(p.phase==='loading'){
          paper.position.x=home.x
          paper.position.y=Math.max(home.y,settledY+bounce)
          paper.position.z=home.z
        }
        const fallingNow=p.phase==='loading'&&fallSeconds>0&&settledY>home.y+.02
        paper.rotation.set(home.rx+(fallingNow?Math.sin(now/75+i)*.08:0)+(shaking?Math.sin(now/110+i)*.08:0),home.ry+(fallingNow?Math.sin(now/90+i)*.12:0),home.rz+(fallingNow?Math.cos(now/80+i)*.08:0)+(shaking?Math.sin(now/100+i)*.16:0))
      })
      falling.forEach((slip,i)=>{
        slip.visible=p.phase==='loading'&&progress<1
        if(slip.visible){const cycle=((elapsed/850)+(i/18))%1;slip.position.y=11.4-cycle*2.1;slip.position.x=Math.sin(now/260+i)*.24;slip.position.z=Math.cos(now/300+i)*.12;slip.rotation.set(-Math.PI/2+Math.sin(now/160+i)*.45,Math.cos(now/220+i)*.4,Math.sin(now/180+i)*.5)}
      })
      const crankElapsed=p.phase==='cranking'?Math.max(0,now-crankStartedAt):0
      const crankProgress=Math.min(1,crankElapsed/2400)
      const leverTravel=crankProgress<.5?crankProgress/.5:1-(crankProgress-.5)/.5
      const easedTravel=leverTravel*leverTravel*(3-2*leverTravel)
      lever.rotation.x=reduced?0:easedTravel*1.35
      if(p.phase==='shaking'){machine.position.x=Math.sin(now/28)*.055;machine.position.z=Math.cos(now/31)*.045;lever.rotation.x=0}else{machine.position.x=0;machine.position.z=0}
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
