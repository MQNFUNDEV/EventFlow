declare module 'spin-wheel' {
  export type WheelItem = { label: string; value?: unknown; backgroundColor?: string; labelColor?: string }
  export type WheelRestEvent = { currentIndex: number; rotation: number }
  export class Wheel {
    constructor(container: Element, props?: Record<string, unknown>)
    items: WheelItem[]
    itemBackgroundColors: string[]
    itemLabelColors: string[]
    onRest: ((event: WheelRestEvent) => void) | null
    spinToItem(itemIndex: number, duration?: number, spinToCenter?: boolean, numberOfRevolutions?: number, direction?: number): void
    remove(): void
  }
}
