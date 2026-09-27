import { Matrix4, Object3D, RedFormat, ShadowBaseNode, ShadowNode, UnsignedByteType, UnsignedShortType, Vector3, Vector4, type DirectionalLight, type DirectionalLightShadow, type Mesh, type Node } from 'three/webgpu'
import { Fn, abs, float, min, reference, renderGroup, shadowPositionWorld, smoothstep, uniform, vec4 } from 'three/tsl'
import type { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'

/**
 * The sun's shadows in two classes of caster:
 *
 * - moving things (the characters, the soldiers' proxies, debris, rocks)
 *   in the cascades (`CSMShadowNode`), drawn every frame as before;
 * - static scenery (the fortress, ~0.9 M triangles) in a cached clipmap:
 *   square-ish light-space levels round the camera, each rendered only when
 *   the camera has moved its snap step (a tenth of the level), when told to
 *   (`invalidate`: detail shown or hidden) or on the first frame. The
 *   fortress used to be redrawn into every cascade every frame; now each
 *   level redraws a few times a second at most while moving, and never
 *   standing still. Its far level also shadows the fortress seen from
 *   outside the cascades' range (from the start, a few hundred metres off).
 *
 * A pixel takes the darker of the two (`min`: either caster blocks the sun).
 * Static casters keep `castShadow` off so the cascades skip them; a level's
 * pass draws only them. Levels are rectangles in light space (the sun is
 * low: the ground they must cover is foreshortened along its azimuth), their
 * centres snapped to their own texel grid, cross-faded finest to coarsest in
 * uniform control flow (every level is sampled every time), their normal
 * bias scaled by their texel size and their filter radius by its inverse
 * (one penumbra width in metres throughout).
 */

export interface StaticShadowLevel {
  /** half-width (m) across the sun's azimuth, and the texture width (texels) */
  halfWidth: number
  mapSize: number
}

/** sun elevation's sine at which the level rectangles are sized, and the tallest static caster (m) */
interface Options {
  levels: StaticShadowLevel[]
  /** room behind the level for casters between it and the sun (m) */
  margin: number
  /** height span of the static casters (m): the level rectangles keep it in frame */
  casterHeight: number
}

/** the share of a level its centre snaps by; the sampled region is shrunk by more (the guard) */
const SNAP = 0.1
const GUARD = 0.16
/**
 * Depth (along the sun) a level covers beyond its half-width, either side of
 * its centre (m). Its receivers lie up to its half-width off the camera
 * across the ground plus the camera's height over them, and its centre's
 * depth snaps in half-width steps: a window of only the half-width left the
 * far side of the finest levels out of it (unshadowed), popping as the camera moved.
 */
const DEPTH_PAD = 60
const BLEND = 0.12
/** coarse levels redrawn per frame at most (the finest always, when it must) */
const BUDGET = 1

class LevelLight extends Object3D {
  readonly target = new Object3D()
  castShadow = true
  shadow: DirectionalLightShadow
  constructor(shadow: DirectionalLightShadow) {
    super()
    this.shadow = shadow
  }
}

/** A static caster and the coarsest level it is drawn into (fine detail is invisible in the coarse levels). */
export interface StaticCaster {
  object: Mesh
  coarsest: number
}

/** A level's shadow pass: only the static casters it carries, and nothing outside its rectangle shadows. */
class StaticLevelNode extends ShadowNode {
  private readonly statics: ReadonlyMap<Object3D, number>
  private readonly index: number
  private filter: ((object: Mesh, ...rest: unknown[]) => void) | null = null

  constructor(light: LevelLight, shadow: DirectionalLightShadow, statics: ReadonlyMap<Object3D, number>, index: number) {
    super(light as never, shadow)
    this.statics = statics
    this.index = index
  }

  getShadowRenderObjectFunction(renderer: any, shadow?: any): any {
    const base = super.getShadowRenderObjectFunction(renderer, shadow) as (object: Mesh, ...rest: unknown[]) => void
    this.filter ??= (object: Mesh, ...rest: unknown[]) => {
      if ((this.statics.get(object) ?? -1) < this.index) return
      // static casters keep castShadow off for the cascades: on for their own pass only
      object.castShadow = true
      base(object, ...rest)
      object.castShadow = false
    }
    return this.filter
  }

  /**
   * A 16-bit depth map (the levels' depth windows are at most ~1.7 km:
   * under 3 cm steps, far inside the bias) and an 8-bit colour buffer that
   * a shadow pass never uses but a render target must have: 3 bytes a texel
   * instead of 8, which pays for the levels' resolution.
   */
  setupRenderTarget(shadow: any, builder: any): any {
    const target = (ShadowNode.prototype as unknown as { setupRenderTarget(s: unknown, b: unknown): { depthTexture: { type: number }; shadowMap: { texture: { format: number; type: number } } } }).setupRenderTarget.call(this, shadow, builder)
    target.depthTexture.type = UnsignedShortType
    target.shadowMap.texture.format = RedFormat
    target.shadowMap.texture.type = UnsignedByteType
    return target
  }

  setupShadowFilter(_builder: any, args: any): any {
    const { filterFn, depthTexture, shadowCoord, shadow, depthLayer } = args
    const inside = shadowCoord.x.greaterThanEqual(0).and(shadowCoord.x.lessThanEqual(1))
      .and(shadowCoord.y.greaterThanEqual(0)).and(shadowCoord.y.lessThanEqual(1))
      .and(shadowCoord.z.greaterThanEqual(0)).and(shadowCoord.z.lessThanEqual(1))
    // filtered unconditionally, then selected: the comparison sample stays in uniform control flow
    const value = filterFn({ depthTexture, shadowCoord, shadow, depthLayer })
    return inside.select(value, float(1))
  }
}

interface LevelState {
  halfX: number
  halfY: number
  texel: number
  cx: number
  cy: number
  cz: number
  dirty: boolean
  /** its map holds no caster (last drawn with none in it): it can move without a redraw while none comes in */
  empty: boolean
}

/** A static caster's bounding circle in light space (the sun is fixed: found once). */
interface Footprint { x: number; y: number; r: number; coarsest: number; object: Object3D }

const _direction = new Vector3()
const _camera = new Vector3()
const _centre = new Vector3()
const ORIGIN = new Vector3()
const UP = new Vector3(0, 1, 0)

export class SunShadowNode extends ShadowBaseNode {
  private readonly sun: DirectionalLight
  private readonly csm: CSMShadowNode
  private readonly statics: Map<Object3D, number>
  private footprints: Footprint[] | null = null
  private readonly options: Options
  private readonly lights: LevelLight[] = []
  private readonly nodes: StaticLevelNode[] = []
  private readonly states: LevelState[] = []
  /** per level, as the shader reads it: committed centre (light space) and sampled half-extents */
  private readonly _levels: Vector4[] = []
  private readonly orientation = new Matrix4()
  private readonly worldToLight = new Matrix4()
  private readonly worldToLightUniform = uniform(this.worldToLight)
  private camera: Object3D | null = null
  private first = true
  /** levels redrawn on the last frame (diagnostics) */
  redrawn = 0

  constructor(sun: DirectionalLight, csm: CSMShadowNode, statics: Iterable<StaticCaster>, options: Options) {
    super(sun)
    this.sun = sun
    this.csm = csm
    this.statics = new Map([...statics].map((c) => [c.object, c.coarsest]))
    this.options = options
    const sinElevation = Math.max(0.05, _direction.copy(sun.position).sub(sun.target.position).normalize().y)
    const cosElevation = Math.sqrt(1 - sinElevation * sinElevation)
    let finest: number | undefined
    for (const level of options.levels) {
      const halfX = level.halfWidth
      // along the sun's azimuth the ground is foreshortened by the sun's elevation; the casters' height stands up in it
      const halfY = Math.min(halfX, halfX * sinElevation + options.casterHeight * cosElevation)
      const texel = (2 * halfX) / level.mapSize
      const shadow = sun.shadow.clone() as DirectionalLightShadow
      shadow.mapSize.set(level.mapSize, Math.ceil((2 * halfY) / texel / 64) * 64)
      const cam = shadow.camera
      cam.left = -halfX
      cam.right = halfX
      cam.top = shadow.mapSize.y * texel / 2
      cam.bottom = -cam.top
      cam.near = 1
      cam.far = options.margin + 2 * (halfX + DEPTH_PAD)
      cam.updateProjectionMatrix()
      shadow.autoUpdate = false
      shadow.needsUpdate = false
      shadow.normalBias = Math.max(sun.shadow.normalBias, 1.4 * texel)
      // the same penumbra in metres at every level: a coarse level filtering over as many texels as the
      // finest smeared a thin caster's shadow (a tower's lattice) to nothing until the camera came close
      finest ??= texel
      shadow.radius = Math.max(1, sun.shadow.radius * finest / texel)
      const light = new LevelLight(shadow)
      this.lights.push(light)
      this.nodes.push(new StaticLevelNode(light, shadow, this.statics, this.nodes.length))
      this.states.push({ halfX, halfY: cam.top, texel, cx: NaN, cy: NaN, cz: NaN, dirty: true, empty: false })
      // parked until drawn: never selected
      this._levels.push(new Vector4(1e9, 1e9, 1e-6, 1e-6))
    }
  }

  /**
   * A static caster appeared or vanished (detail shown or hidden): redraw the
   * levels it is drawn into whose rectangle it touches (coarse levels within
   * the frame budget).
   */
  invalidate(object: Object3D): void {
    const f = this.footprints?.find((p) => p.object === object)
    if (!f) return this.invalidateAll()
    for (let i = 0; i <= Math.min(f.coarsest, this.states.length - 1); i++) {
      const s = this.states[i]
      if (Math.abs(f.x - s.cx) < s.halfX + f.r && Math.abs(f.y - s.cy) < s.halfY + f.r) s.dirty = true
    }
  }

  /** Redraw every level (the casters' visibility was overridden, as for a warm-up draw). */
  invalidateAll(): void {
    for (const s of this.states) {
      s.dirty = true
      s.empty = false
    }
  }

  /** Whether any caster drawn into level `i` reaches its rectangle centred at (cx, cy). */
  private occupied(i: number, cx: number, cy: number): boolean {
    const s = this.states[i]
    for (const f of this.footprints!) {
      if (f.coarsest >= i && Math.abs(f.x - cx) < s.halfX + f.r && Math.abs(f.y - cy) < s.halfY + f.r) return true
    }
    return false
  }

  private measure(): Footprint[] {
    const out: Footprint[] = []
    for (const [object, coarsest] of this.statics) {
      const mesh = object as Mesh
      mesh.updateWorldMatrix(true, false)
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
      const sphere = mesh.geometry.boundingSphere!
      _centre.copy(sphere.center).applyMatrix4(mesh.matrixWorld).applyMatrix4(this.worldToLight)
      out.push({ x: _centre.x, y: _centre.y, r: sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis(), coarsest, object })
    }
    return out
  }

  build(builder: any, output?: any): any {
    // register before the level nodes, so their lights are placed before they render
    builder.addSequentialNode(this)
    return super.build(builder, output)
  }

  setup(builder: any): any {
    this.camera ??= builder.camera as Object3D
    const levels = (reference('_levels', 'vec4', this) as any).setGroup(renderGroup).setName('staticShadowLevels')
    const statics = Fn((fn) => {
      this.setupShadowPosition(fn as any)
      const p = this.worldToLightUniform.mul(vec4(shadowPositionWorld as unknown as Node<'vec3'>, 1)).xy.toVar()
      const sum = vec4(0).toVar()
      const remaining = float(1).toVar()
      for (let i = 0; i < this.nodes.length; i++) {
        const level = levels.element(i).toVar()
        const fx = float(1).sub(smoothstep(level.z.mul(1 - BLEND), level.z, abs(p.x.sub(level.x))))
        const fy = float(1).sub(smoothstep(level.w.mul(1 - BLEND), level.w, abs(p.y.sub(level.y))))
        const fade = fx.mul(fy)
        sum.addAssign(vec4(this.nodes[i] as unknown as Node<'vec4'>).mul(fade.mul(remaining)))
        remaining.mulAssign(float(1).sub(fade))
      }
      return sum.add(vec4(remaining))
    })()
    return min(vec4(this.csm as unknown as Node<'vec4'>), statics) as Node<'vec4'>
  }

  updateBefore(): boolean {
    const parent = this.sun.parent
    if (!parent || !this.camera) return false
    for (const light of this.lights) {
      if (light.parent === null) parent.add(light, light.target)
    }
    _direction.subVectors(this.sun.target.position, this.sun.position).normalize()
    this.orientation.lookAt(ORIGIN, _direction, UP)
    this.worldToLight.copy(this.orientation).invert()
    _camera.setFromMatrixPosition(this.camera.matrixWorld).applyMatrix4(this.worldToLight)
    this.footprints ??= this.measure()
    let budget = this.first ? this.states.length : BUDGET
    this.first = false
    this.redrawn = 0
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]
      const step = Math.max(s.texel, Math.round((s.halfX * SNAP) / s.texel) * s.texel)
      const cx = Math.round(_camera.x / step) * step
      const cy = Math.round(_camera.y / step) * step
      const cz = Math.round(_camera.z / (s.halfX * 0.5)) * (s.halfX * 0.5)
      if (cx !== s.cx || cy !== s.cy || cz !== s.cz) s.dirty = true
      if (!s.dirty) continue
      const occupied = this.occupied(i, cx, cy)
      // an empty map stays empty where nothing comes in: move it without drawing (out in the open desert)
      const draw = occupied || !s.empty
      // the finest level is redrawn whenever it must; the others share a small budget per frame
      if (draw && i > 0 && budget <= 0) continue
      if (draw && i > 0) budget--
      s.cx = cx
      s.cy = cy
      s.cz = cz
      s.dirty = false
      s.empty = !occupied
      this._levels[i].set(cx, cy, s.halfX * (1 - GUARD), s.halfY * (1 - GUARD))
      if (!draw) continue
      const light = this.lights[i]
      _centre.set(cx, cy, cz + s.halfX + DEPTH_PAD + this.options.margin).applyMatrix4(this.orientation)
      light.position.copy(_centre)
      light.target.position.copy(_centre).add(_direction)
      light.updateMatrixWorld(true)
      light.target.updateMatrixWorld(true)
      light.shadow.needsUpdate = true
      this.redrawn++
    }
    return true
  }

  dispose(): void {
    for (const node of this.nodes) node.dispose()
    for (const light of this.lights) {
      light.shadow.dispose()
      light.parent?.remove(light, light.target)
    }
    super.dispose()
  }
}
