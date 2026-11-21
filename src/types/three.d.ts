declare module 'three' {
  const THREE: any
  export = THREE
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(camera: any, domElement: HTMLElement)
    target: any
    enableDamping: boolean
    dampingFactor: number
    minDistance: number
    maxDistance: number
    maxPolarAngle: number
    update(): void
    dispose(): void
  }
}
