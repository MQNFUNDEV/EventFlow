import {useEffect,useRef} from 'react'
import './LuckyDrawMachine.css'
export default function LuckyDrawMachine({isSpinning=false,paperCount=0}:{isSpinning?:boolean;paperCount?:number}){
 const host=useRef<HTMLDivElement>(null),motion=useRef({isSpinning,paperCount})
 useEffect(()=>{motion.current={isSpinning,paperCount}},[isSpinning,paperCount])
 useEffect(()=>{const el=host.current;if(!el)return;let live=true,raf=0,renderer:any,scene:any,controls:any,arm:any,observer:ResizeObserver|undefined;let papers:any[]=[]
 async function start(){
 const url='https://esm.sh/three@0.180.0',ctl='https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js'
 const T=await import(/* @vite-ignore */url),{OrbitControls}=await import(/* @vite-ignore */ctl);if(!live)return
 scene=new T.Scene();scene.background=new T.Color('#f2f5f8')
 const camera=new T.PerspectiveCamera(35,1,.1,100);camera.position.set(14,20,16);camera.lookAt(0,4.8,0)
 renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;el.appendChild(renderer.domElement)
 scene.add(new T.HemisphereLight(0xffffff,0x8796a8,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(8,18,12);light.castShadow=true;scene.add(light)
 const root=new T.Group();scene.add(root);const glass=new T.MeshPhysicalMaterial({color:0xd9efff,roughness:.06,transmission:.78,thickness:.12,transparent:true,opacity:.2,clearcoat:1,side:T.DoubleSide,depthWrite:false}),edge=new T.LineBasicMaterial({color:0x9bc8e5,transparent:true,opacity:.9}),steel=new T.MeshStandardMaterial({color:0x9aa7b4,metalness:.9,roughness:.2}),chrome=new T.MeshStandardMaterial({color:0xe0e7ed,metalness:.96,roughness:.12}),dark=new T.MeshStandardMaterial({color:0x303b49,metalness:.6,roughness:.25})
 const base=new T.Mesh(new T.BoxGeometry(10.2,.34,10.2),steel);base.position.y=-.15;root.add(base)
 function panel(w:number,h:number,d:number,x:number,y:number,z:number){const g=new T.BoxGeometry(w,h,d),m=new T.Mesh(g,glass);m.position.set(x,y,z);root.add(m);const e=new T.LineSegments(new T.EdgesGeometry(g),edge);e.position.copy(m.position);root.add(e)}
 panel(10,.065,10,0,.15,0);panel(10,10,.065,0,5.15,5);panel(10,10,.065,0,5.15,-5);panel(.065,10,10,-5,5.15,0);panel(.065,10,10,5,5.15,0)
 const lid=new T.Group();lid.position.y=10.2;root.add(lid);const topGeo=new T.BoxGeometry(10.05,.075,10.05);lid.add(new T.Mesh(topGeo,glass));lid.add(new T.LineSegments(new T.EdgesGeometry(topGeo),edge))
 const rim=new T.MeshStandardMaterial({color:0xb8c8d6,metalness:.72,roughness:.22});for(const [x,z,w,d] of [[0,-4.93,10.1,.13],[0,4.93,10.1,.13],[-4.93,0,.13,9.9],[4.93,0,.13,9.9]]){const r=new T.Mesh(new T.BoxGeometry(w,.15,d),rim);r.position.set(x,.02,z);lid.add(r)}
 const pm=['#fff5d9','#f8e7b9','#fffaf0','#e9f0fb'].map(color=>new T.MeshStandardMaterial({color,roughness:.9})),pg=new T.BoxGeometry(1.55,.035,.62)
 for(let i=0;i<150;i++){const p=new T.Mesh(pg,pm[i%4]),a=i*2.399,r=.55+(i%7)*.48;p.position.set(Math.cos(a)*r,.28+Math.floor(i/18)*.24,Math.sin(a)*r);p.rotation.y=a;p.rotation.z=((i%7)-3)*.035;p.visible=i<Math.min(motion.current.paperCount*3,150);root.add(p);papers.push(p)}
 const lever=new T.Group();lever.position.set(5.17,5.1,0);root.add(lever);const mount=new T.Mesh(new T.CylinderGeometry(.78,.78,.24,48),dark);mount.rotation.z=Math.PI/2;lever.add(mount);const bezel=new T.Mesh(new T.TorusGeometry(.58,.075,16,48),chrome);bezel.rotation.y=Math.PI/2;bezel.position.x=.16;lever.add(bezel);const pivot=new T.Mesh(new T.CylinderGeometry(.36,.36,.42,40),chrome);pivot.rotation.z=Math.PI/2;pivot.position.x=.2;lever.add(pivot);arm=new T.Group();arm.position.set(.32,.25,0);lever.add(arm);const shaft=new T.Mesh(new T.CylinderGeometry(.12,.17,3.15,24),steel);shaft.position.y=1.62;arm.add(shaft);const grip=new T.Mesh(new T.SphereGeometry(.43,32,24),dark);grip.position.y=3.38;arm.add(grip)
 const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({opacity:.15}));ground.rotation.x=-Math.PI/2;ground.position.y=-.34;scene.add(ground)
 controls=new OrbitControls(camera,renderer.domElement);controls.target.set(.35,4.8,0);controls.enableDamping=true;controls.minDistance=12;controls.maxDistance=42;controls.maxPolarAngle=Math.PI*.48
 const resize=()=>{camera.aspect=Math.max(el.clientWidth,1)/Math.max(el.clientHeight,1);camera.updateProjectionMatrix();renderer.setSize(Math.max(el.clientWidth,1),Math.max(el.clientHeight,1),false)};observer=new ResizeObserver(resize);observer.observe(el);resize()
 const clock=new T.Clock();const draw=()=>{if(!live)return;const t=clock.getElapsedTime(),active=motion.current.isSpinning;arm.rotation.z+=((active?-.78+Math.sin(t*15)*.045:0)-arm.rotation.z)*.16;const n=Math.min(motion.current.paperCount*3,papers.length);papers.forEach((p,i)=>{p.visible=i<n;if(active&&i>=Math.max(0,n-18)&&i<n)p.position.y=.3+((t*2.8+i*.17)%2.2)});controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(draw)};draw()
 }
 void start().catch(()=>{if(el)el.innerHTML='<div class="ld-machine-error">3D preview could not load. Refresh to retry.</div>'})
 return()=>{live=false;cancelAnimationFrame(raf);observer?.disconnect();controls?.dispose();scene?.traverse((o:any)=>{o.geometry?.dispose?.();(Array.isArray(o.material)?o.material:[o.material]).forEach((m:any)=>m?.dispose?.())});renderer?.dispose();renderer?.domElement.remove()}
 },[])
 return <section className="ld-machine-preview"><header className="ld-machine-preview-head"><div><span className="ld-machine-kicker">LUCKY DRAW · MACHINE DIORAMA</span><h2>Paper Draw Machine</h2><p>Transparent acrylic enclosure · accumulating paper slips · mechanical side lever</p></div><span className="ld-machine-status">3D PREVIEW</span></header><div className="ld-machine-stage" ref={host}><span className="ld-machine-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span></div><footer className="ld-machine-preview-footer"><strong>10 × 10 × 10 inch acrylic box · PAPER SLIPS: {Math.min(paperCount*3,150)}</strong></footer></section>
}