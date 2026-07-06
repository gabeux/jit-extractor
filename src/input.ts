// Keyboard + mouse state. Mouse coords are in logical canvas space (960x540).
export class Input {
  private downKeys = new Set<string>()
  private pressedKeys = new Set<string>()
  private releasedKeys = new Set<string>()
  mouseX = 480
  mouseY = 270
  mouseDown = false
  mousePressed = false
  private typedBuffer = ''
  /** Fires once on the very first user gesture (for audio unlock). */
  onFirstGesture: (() => void) | null = null
  private gestured = false

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      // printable chars for name entry (and repeats for held backspace)
      if (e.key.length === 1) this.typedBuffer += e.key
      if (!e.repeat) {
        this.pressedKeys.add(e.code)
        this.downKeys.add(e.code)
        this.gesture()
      } else if (e.code === 'Backspace') {
        this.pressedKeys.add(e.code)
      }
    })
    window.addEventListener('keyup', (e) => {
      this.downKeys.delete(e.code)
      this.releasedKeys.add(e.code)
    })
    window.addEventListener('blur', () => {
      this.downKeys.clear()
      this.mouseDown = false
    })
    canvas.addEventListener('mousemove', (e) => this.updateMouse(e))
    canvas.addEventListener('mousedown', (e) => {
      this.updateMouse(e)
      this.mouseDown = true
      this.mousePressed = true
      this.gesture()
    })
    window.addEventListener('mouseup', () => { this.mouseDown = false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private gesture() {
    if (!this.gestured) {
      this.gestured = true
      this.onFirstGesture?.()
    }
  }

  private updateMouse(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect()
    this.mouseX = ((e.clientX - r.left) / r.width) * 960
    this.mouseY = ((e.clientY - r.top) / r.height) * 540
  }

  isDown(code: string): boolean { return this.downKeys.has(code) }
  wasPressed(code: string): boolean { return this.pressedKeys.has(code) }
  wasReleased(code: string): boolean { return this.releasedKeys.has(code) }

  /** Horizontal move axis: -1, 0 or 1. */
  axisX(): number {
    let x = 0
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1
    return x
  }

  /** Printable characters typed since last frame (for name entry). */
  consumeTyped(): string {
    const t = this.typedBuffer
    this.typedBuffer = ''
    return t
  }

  /** Call once per rendered frame, after all fixed updates consumed events. */
  endFrame() {
    this.pressedKeys.clear()
    this.releasedKeys.clear()
    this.mousePressed = false
    this.typedBuffer = ''
  }
}
