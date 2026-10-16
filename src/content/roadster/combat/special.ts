import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'
import type { MoveCue } from '../../transformer/combat/moves'
import type { BlastHit, MoveHits, PullHit, StrikeHit } from '../../transformer/combat/hits'
import type { SpecialMove } from '../../transformer/combat/special'
import { shockFront, shockReaches } from '../../transformer/combat/fx/shock-front'

/**
 * Whiteout: the Roadster's special. The visor blazes and it drops into a
 * sprinter's crouch, the air pack on its back lighting; it breaks into a run
 * and sweeps round a ring thirty-two metres across, faster and faster, the
 * pack driving it, a speedster's streaks of light trailing round the ring
 * behind it (fx/speed-trails.ts) and its afterimages strung out ever further
 * apart (fx/afterimages.ts), drawing the ring in tighter lap by lap and
 * crushing everything inside into a dense, battered crowd.
 * Out of the last lap it leaps, the pack bursting under it, and climbs
 * twenty-four metres over the crowd; it hangs there on the pack's columns of
 * air, both hands raised, and in slow motion conjures the biggest blast of
 * energy it has (fx/energy-orb.ts), the sky's charge crackling into it; it
 * hurls it down into the crowd: a white sun on the sand, everything thrown
 * off it. It comes down slowly on the pack through the drifting cloud and
 * stands in the glass.
 *
 * Special time (s): gather 0-0.55 (the turn onto the ring from 0.35), the
 * ring RING (3.5 laps clockwise seen from above, the centre on its right; the
 * first lap at the full radius, then drawn in to the last), the leap from its
 * end to the hover over the crowd, the charge (slow motion), the throw and
 * IMPACT, the descent on the pack to LAND, the rise and the handback.
 *
 * Ring geometry, in the special's ground frame ([lateral + left, forward]):
 * the centre CENTER ahead; at angle phi (clockwise from the start) and
 * radius r the robot stands at [r sin phi, CENTER - r cos phi], heading
 * 90 - phi degrees. At phi 0 and the full radius that is where it began.
 */
const CENTER = 16
const R0 = 16
const R1 = 6
const RING: [number, number] = [0.6, 4.4]
const LAPS = 3.5
/** Share of the ring's time over which the run builds to its full speed. */
const BUILD = 0.28
/** The leap, the climb's top over the crowd (m, the lowest foot) and where it hangs (m ahead: short of the centre, so the throw goes down and forward). */
const LEAP = RING[1]
const HOVER_AT = CENTER - 7
const APEX = 24
const HOVER: [number, number] = [5.85, 7.6]
const THROW = 7.62
const IMPACT = 7.95
const LAND = 10.75
/** The orb's charge reaching down into the crowd as it grows (its arcs and their seizing strikes). */
const CRACKLE = [6.4, 6.85, 7.3]
/** Where it comes down: the near rim of the blast's glass. */
const LAND_AT = CENTER - 5.5
/** The impact's blast wave (fx/burst-ring.ts): its foot grows from `from` to `reach` m over `life` s. */
const BLAST_WAVE = { from: 2, reach: 46, life: 1.25 } as const

/** The run's legs: steps per second and their throw (m forward and back of the hip, swing lift). */
const CADENCE = 3.2
const STRIDE = 1.35
const SWING_LIFT = 0.95

type Point = readonly [number, number]
const rad = (deg: number): number => deg * Math.PI / 180

/** The ring's angle (deg) over its window: a constant-acceleration build-up, then steady. */
function phiAt(t: number): number {
  const u = Math.min(1, Math.max(0, (t - RING[0]) / (RING[1] - RING[0])))
  const total = 360 * LAPS
  const v = total / (1 - BUILD / 2)
  return u < BUILD ? v * u * u / (2 * BUILD) : v * (u - BUILD / 2)
}

/** The ring's radius: the full ring for the first lap, then drawn in steadily to the last. */
function radiusAt(t: number): number {
  const phi = phiAt(t)
  if (phi <= 360) return R0
  const u = Math.min(1, (phi - 360) / (360 * (LAPS - 1)))
  return R0 + (R1 - R0) * u * u * (3 - 2 * u)
}

const ring = (phi: number, r: number): Point => [r * Math.sin(rad(phi)), CENTER - r * Math.cos(rad(phi))]

/** Free-leg pose per side: [lx, ly, lz, lp]. */
type Leg = readonly [number, number, number, number]
/** Hanging under the pack: the legs a little apart, one knee forward. */
const HANG: Record<'L' | 'R', Leg> = { L: [-0.1, 0.45, 0.55, 20], R: [-0.15, -0.3, 0.25, 30] }
/** Tucked in the leap. */
const TUCK: Record<'L' | 'R', Leg> = { L: [-0.15, 0.9, 1.5, 10], R: [-0.2, 0.2, 1.0, 35] }
/** Reaching for the ground at the end of the descent. */
const REACH: Record<'L' | 'R', Leg> = { L: [0.05, 0.35, 0.2, 8], R: [-0.05, -0.25, 0.12, 12] }

function keys(): Partial<Record<Channel, Key[]>> {
  const k: Partial<Record<Channel, Key[]>> = {}
  const put = (c: Channel, t: number, v: number): void => { (k[c] ??= []).push([t, v]) }
  const leg = (t: number, pose: Record<'L' | 'R', Leg>): void => {
    for (const side of ['L', 'R'] as const) {
      const [lx, ly, lz, lp] = pose[side]
      put(`${side}.lx`, t, lx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }

  // ---- the gather: down into a sprinter's crouch, turning onto the ring
  put('hipDrop', 0.3, 0.5)
  put('hipDrop', 0.55, 0.72)
  put('hipPitch', 0.3, 10)
  put('hipPitch', 0.55, 24)
  put('spineX', 0.3, 4)
  put('spineX', 0.55, 8)
  put('headX', 0.25, -16)
  put('headX', 0.55, -22)
  put('turn', 0.32, 0)
  put('turn', RING[0], 90)
  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? 1 : -1
    put(`${side}.az`, 0.3, 10)
    put(`${side}.el`, 0.3, s > 0 ? -50 : -10)
    put(`${side}.reach`, 0.3, 0.6)
    put(`${side}.elbow`, 0.3, 30)
    put(`${side}.grip`, 0.2, 1)
  }

  // ---- the ring: the run, the legs in a sprint's cycle (free legs carried with the body), the arms pumping against them
  const end = RING[1]
  put('air', RING[0] - 0.02, 0)
  const period = 2 / CADENCE
  for (let t = RING[0]; t <= end + 1e-6; t += period / 4) {
    const cycle = (t - RING[0]) / period
    for (const side of ['R', 'L'] as const) {
      const u = (cycle + (side === 'R' ? 0 : 0.5)) % 1
      // stance: down, sweeping back under the body; swing: lifted, brought forward
      let ly: number, lz: number, lp: number
      if (u < 0.45) {
        const v = u / 0.45
        ly = STRIDE * (1 - 2 * v)
        lz = 0
        lp = v < 0.8 ? 0 : 30 * (v - 0.8) / 0.2
      } else {
        const v = (u - 0.45) / 0.55
        ly = -STRIDE + 2 * STRIDE * v * v * (3 - 2 * v)
        lz = SWING_LIFT * Math.sin(Math.PI * v) ** 1.2
        lp = v < 0.5 ? 35 - 50 * v : 10 - 20 * (v - 0.5)
      }
      put(`${side}.lx`, t, -0.35)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
      // the arm opposite its leg: forward as the leg goes back
      put(`${side}.el`, t, -18 + 34 * (ly / STRIDE) * -1)
    }
    put('air', t, 0.06 + 0.12 * Math.abs(Math.sin(cycle * Math.PI * 2)))
  }
  put('hipDrop', RING[0] + 0.3, 0.55)
  put('hipDrop', end - 0.1, 0.55)
  put('hipPitch', RING[0] + 0.3, 20)
  put('hipPitch', end - 0.1, 26)
  // leaning in toward the centre on its right, harder as the ring tightens
  put('hipRoll', RING[0] + 0.3, -4)
  put('hipRoll', end - 0.1, -12)
  put('chestY', RING[0] + 0.3, -3)
  put('chestY', end - 0.1, -8)
  put('headX', RING[0] + 0.3, -26)
  put('headZ', RING[0] + 0.3, -10)
  put('headZ', end - 0.1, -18)
  for (const side of ['R', 'L'] as const) {
    put(`${side}.az`, RING[0] + 0.2, 6)
    put(`${side}.reach`, RING[0] + 0.2, 0.58)
    put(`${side}.elbow`, RING[0] + 0.2, 18)
    put(`${side}.az`, end - 0.05, 6)
    put(`${side}.reach`, end - 0.05, 0.58)
  }
  const samples = Math.round(LAPS * 12)
  for (let i = 1; i <= samples; i++) {
    const t = RING[0] + (RING[1] - RING[0]) * i / samples
    const phi = phiAt(t)
    const [lat, fwd] = ring(phi, radiusAt(t))
    put('strafe', t, lat)
    put('advance', t, fwd)
    put('turn', t, 90 - phi)
  }
  put('strafe', RING[0], 0)
  put('advance', RING[0], 0)

  // ---- the leap: off the last lap, the pack bursting, up over the crowd; it turns back to face the way it began
  const [lat0, fwd0] = ring(phiAt(end), R1)
  const climb: Array<[number, number, number, number]> = [
    [end + 0.12, lat0 * 0.85, fwd0 + (HOVER_AT - fwd0) * 0.1, 2.6],
    [end + 0.35, lat0 * 0.55, fwd0 + (HOVER_AT - fwd0) * 0.35, 8.5],
    [end + 0.65, lat0 * 0.25, fwd0 + (HOVER_AT - fwd0) * 0.7, 15.5],
    [end + 1.05, lat0 * 0.05, HOVER_AT, 21.6],
    [HOVER[0], 0, HOVER_AT, APEX],
  ]
  for (const [t, lat, fwd, air] of climb) {
    put('strafe', t, lat)
    put('advance', t, fwd)
    put('air', t, air)
  }
  put('turn', end + 0.9, 90 - 360 * LAPS - 90)
  put('hipDrop', end + 0.04, 0.85)
  put('hipDrop', end + 0.3, 0.15)
  put('hipDrop', HOVER[0], 0.1)
  put('hipPitch', end + 0.04, 30)
  put('hipPitch', end + 0.4, 6)
  put('hipPitch', HOVER[0], 2)
  put('hipRoll', end + 0.3, 0)
  put('chestY', end + 0.3, 0)
  put('headX', end + 0.3, -14)
  put('headZ', end + 0.3, 0)
  leg(end + 0.32, TUCK)
  leg(HOVER[0], HANG)
  for (const side of ['R', 'L'] as const) {
    put(`${side}.az`, end + 0.3, 30)
    put(`${side}.el`, end + 0.3, -40)
    put(`${side}.reach`, end + 0.3, 0.75)
    put(`${side}.elbow`, end + 0.3, 20)
  }

  // ---- the hover: hanging on the pack over the crowd, both hands raised overhead, the orb forming between them
  const raise = HOVER[0] + 0.35
  for (const t of [HOVER[0] + 0.5, HOVER[0] + 0.95, HOVER[0] + 1.4]) put('air', t, APEX + (t === HOVER[0] + 0.95 ? 0.35 : 0))
  put('air', HOVER[1], APEX + 0.2)
  for (const side of ['R', 'L'] as const) {
    put(`${side}.out`, HOVER[0] - 0.05, 0)
    put(`${side}.out`, raise, 1)
    put(`${side}.out`, THROW, 1)
    put(`${side}.out`, THROW + 0.12, 0)
    put(`${side}.az`, raise, -12)
    put(`${side}.el`, raise, 72)
    put(`${side}.reach`, raise, 0.86)
    put(`${side}.elbow`, raise, 6)
    put(`${side}.grip`, raise - 0.1, 0)
    put(`${side}.wz`, raise, -90)
    put(`${side}.wy`, raise, -20)
    put(`${side}.az`, HOVER[1] - 0.05, -14)
    put(`${side}.el`, HOVER[1] - 0.05, 78)
    put(`${side}.reach`, HOVER[1] - 0.05, 0.84)
  }
  put('hipPitch', raise, -6)
  put('spineX', raise, -6)
  put('chestX', raise, -8)
  put('headX', raise, -24)
  put('hipPitch', HOVER[1] - 0.05, -9)
  put('spineX', HOVER[1] - 0.05, -8)
  put('chestX', HOVER[1] - 0.05, -10)
  put('headX', HOVER[1] - 0.05, -10)

  // ---- the throw: both arms driven forward and down, palms on the crowd; the body folds over them
  for (const side of ['R', 'L'] as const) {
    put(`${side}.az`, THROW, -10)
    put(`${side}.el`, THROW, -42)
    put(`${side}.reach`, THROW, 0.97)
    put(`${side}.wz`, THROW, -90)
    put(`${side}.wy`, THROW, -80)
    put(`${side}.az`, IMPACT + 0.4, -6)
    put(`${side}.el`, IMPACT + 0.4, -46)
    put(`${side}.reach`, IMPACT + 0.4, 0.9)
  }
  put('hipPitch', THROW, 14)
  put('spineX', THROW, 10)
  put('chestX', THROW, 12)
  put('headX', THROW, 18)
  put('hipPitch', IMPACT + 0.4, 10)
  put('spineX', IMPACT + 0.4, 6)
  put('headX', IMPACT + 0.4, 22)
  put('air', THROW, APEX + 0.6)
  put('air', IMPACT, APEX + 0.9)

  // ---- the descent: slowly down on the pack, the arms easing out for balance, the legs reaching for the ground
  const descent: Array<[number, number, number]> = [
    [IMPACT + 0.6, HOVER_AT, APEX + 0.3],
    [8.9, HOVER_AT + 1.2, APEX - 3],
    [9.5, HOVER_AT + 2.2, 14],
    [10.05, LAND_AT - 1.2, 6.5],
    [10.45, LAND_AT - 0.4, 1.8],
    [LAND - 0.02, LAND_AT, 0],
  ]
  for (const [t, fwd, air] of descent) {
    put('advance', t, fwd)
    put('strafe', t, 0)
    put('air', t, air)
  }
  leg(9.2, HANG)
  leg(10.2, REACH)
  for (const side of ['R', 'L'] as const) {
    put(`${side}.out`, IMPACT + 0.7, 0)
    put(`${side}.az`, 9.3, 40)
    put(`${side}.el`, 9.3, -30)
    put(`${side}.reach`, 9.3, 0.82)
    put(`${side}.wz`, 9.3, -20)
    put(`${side}.wy`, 9.3, -10)
    put(`${side}.grip`, 9.3, 0.4)
    put(`${side}.az`, LAND + 0.3, 14)
    put(`${side}.el`, LAND + 0.3, -50)
    put(`${side}.reach`, LAND + 0.3, 0.7)
    put(`${side}.az`, LAND + 1.2, 4)
    put(`${side}.el`, LAND + 1.2, -70)
    put(`${side}.reach`, LAND + 1.2, 0.92)
    put(`${side}.wz`, LAND + 1.2, 0)
    put(`${side}.wy`, LAND + 1.2, 0)
  }
  put('hipPitch', 9.3, 4)
  put('spineX', 9.3, 2)
  put('chestX', 9.3, 2)
  put('headX', 9.3, 14)
  put('hipDrop', 10.2, 0.1)
  // the landing: the knees take it, then it stands
  put('hipDrop', LAND + 0.12, 0.62)
  put('hipDrop', LAND + 0.5, 0.55)
  put('hipDrop', LAND + 1.3, 0.06)
  put('hipPitch', LAND + 0.12, 10)
  put('hipPitch', LAND + 1.3, 0)
  put('spineX', LAND + 1.3, 0)
  put('chestX', LAND + 1.3, 0)
  put('headX', LAND + 0.5, 6)
  put('headX', LAND + 1.3, 0)
  for (const side of ['L', 'R'] as const) {
    k[`${side}.free`] = [[RING[0] - 0.02, 0], [RING[0] + 0.06, 1], [LAND - 0.01, 1], [LAND + 0.08, 0]]
    put(`${side}.lz`, LAND - 0.03, 0)
  }
  put('L.ly', LAND - 0.03, 0.3)
  put('R.ly', LAND - 0.03, -0.3)
  put('L.lx', LAND - 0.03, 0.05)
  put('R.lx', LAND - 0.03, 0.05)

  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function cues(): MoveCue[] {
  return [
    { t: 0.02, cue: 'servo', value: 0.45 },
    { t: 0.06, cue: 'visor', value: 1 },
    { t: 0.2, cue: 'mark', value: CENTER },
    { t: 0.2, cue: 'pack', value: 0.35 },
    { t: 0.3, cue: 'zone', value: 0.6 },
    { t: 0.5, cue: 'zone', value: 0 },
    { t: RING[0] - 0.05, cue: 'pack', value: 0.8 },
    { t: RING[0], cue: 'sprint', value: 1 },
    { t: RING[0], cue: 'kick', value: 0.3 },
    { t: RING[0] + 1.2, cue: 'pack', value: 1 },
    { t: LEAP - 0.02, cue: 'sprint', value: 0 },
    { t: LEAP, cue: 'leap', value: 1 },
    { t: LEAP, cue: 'pack', value: 1.25 },
    { t: LEAP + 1.1, cue: 'pack', value: 0.75 },
    { t: HOVER[0] + 0.3, cue: 'orb', value: 1 },
    { t: HOVER[0] + 0.45, cue: 'zone', value: 0.85 },
    { t: HOVER[0] + 0.5, cue: 'hush', value: 0.55 },
    ...CRACKLE.map((t): MoveCue => ({ t, cue: 'crackle', value: 1 })),
    { t: THROW - 0.04, cue: 'hush', value: 0 },
    { t: THROW, cue: 'zone', value: 0 },
    { t: THROW, cue: 'throw', value: 1 },
    { t: THROW, cue: 'punch', value: 8 },
    { t: IMPACT, cue: 'impact', value: 1 },
    { t: IMPACT + 0.5, cue: 'pack', value: 0.55 },
    { t: 9.6, cue: 'pack', value: 0.75 },
    { t: LAND - 0.15, cue: 'pack', value: 0 },
    { t: LAND, cue: 'land', value: 1 },
    { t: LAND + 0.6, cue: 'servo', value: 0.45 },
    { t: LAND + 1.0, cue: 'visor', value: 0 },
  ]
}

/** Whiteout's geometry and times, for what it does to the soldiers and its effects. */
export const WHITEOUT = {
  center: CENTER,
  ring: RING,
  laps: LAPS,
  /** the ring's radius at special time t (m) */
  radiusAt,
  /** the ring's angle at special time t (deg, clockwise from the start) */
  phiAt,
  leap: LEAP,
  hover: HOVER,
  apex: APEX,
  throw: THROW,
  impact: IMPACT,
  land: LAND,
  /** where the throw hangs from, and the impact (m ahead) */
  hoverAt: HOVER_AT,
  blastWave: BLAST_WAVE,
} as const

/**
 * What Whiteout does to the soldiers: the ring draws everything within
 * twenty-two metres of its centre in, harder lap by lap, and the wall going
 * round beats on whatever it holds (a blow every RING_BEAT on everything
 * inside it); the orb's charge crackles down into the crowd and holds it
 * seizing; the impact is the last blow, breaking the crushed crowd under it
 * (CORE m), and its blast wave throws everything out to 26 m as its front
 * reaches it.
 */
const RING_BEAT = 0.2
const ringBlows: BlastHit[] = []
for (let t = RING[0] + 0.8; t < RING[1] - 0.05; t += RING_BEAT) {
  ringBlows.push({ t, kind: 'blunt', blowSound: 'none', at: [0, CENTER], radius: Math.max(5, radiusAt(t) - 0.5), damage: 18, knock: 0.6, lift: 0.4 })
}
const pulls: PullHit[] = [
  { t0: RING[0] + 0.3, t1: 1.9, at: [0, CENTER], radius: 22, speed: 5 },
  { t0: 1.9, t1: 3.1, at: [0, CENTER], radius: 22, speed: 9 },
  { t0: 3.1, t1: RING[1] + 0.3, at: [0, CENTER], radius: 22, speed: 13 },
]
/** The orb's charge reaching down into the crowd as it grows: it seizes them where they stand. */
const crackle: StrikeHit[] = CRACKLE.map((t) => ({
  t, kind: 'blast', blowSound: 'none', reach: 11, arc: 360, damage: 20, knock: 0, lift: 0, outward: true, bite: false, shock: 0.5,
}))

/**
 * The blast wave, as the Impala's finale wave: a band every WAVE_BEAT of its
 * life, from the core out to the blast's reach, catching whatever its front
 * has passed since the last and throwing it alike.
 */
const CORE = 7
const BLAST_REACH = 26
const WAVE_BEAT = 0.04
const wave: BlastHit[] = []
{
  const { from, reach, life } = BLAST_WAVE
  const end = shockReaches(from, reach, BLAST_REACH)
  let inner = CORE
  for (let u = shockReaches(from, reach, CORE) + WAVE_BEAT / life; inner < BLAST_REACH; u += WAVE_BEAT / life) {
    const front = u >= end ? BLAST_REACH : shockFront(from, reach, u)
    if (front <= inner) continue
    wave.push({ t: IMPACT + Math.min(u, end) * life, kind: 'blast', blowSound: 'none', at: [0, CENTER], radius: front, inner, damage: 600, knock: 24, lift: 12 })
    inner = front
  }
}

export const WHITEOUT_HITS: MoveHits = {
  pulls,
  blasts: [...ringBlows, { t: IMPACT, kind: 'blast', blowSound: 'none', at: [0, CENTER], radius: CORE, damage: 600, knock: 30, lift: 17 }, ...wave],
  strikes: crackle,
}

export const ROADSTER_SPECIAL: SpecialMove = {
  name: 'whiteout',
  handback: LAND + 0.9,
  handbackView: { yaw: Math.PI, pitch: 0.2 },
  // the charge hangs in slow motion; the impact freezes, then plays out slowly
  tempo: [[HOVER[0] + 0.2, 1], [HOVER[0] + 0.55, 0.55], [THROW - 0.08, 0.55], [THROW + 0.04, 1], [IMPACT - 0.01, 1], [IMPACT + 0.02, 0.2], [IMPACT + 0.35, 0.4], [8.75, 0.85], [9.05, 1]],
  move: { name: 'whiteout', duration: LAND + 1.6, chain: [LAND + 1.6, LAND + 1.6], keys: keys(), cues: cues() },
  shots: [
    // the visor blazing, the crouch going down under it
    { at: 0, eyeFrame: 'head', eye: [[0, -1.6, 2.6, 0.3], [0.55, -1.3, 2.2, 0.15]], lookFrame: 'head', look: [[0, 0, 0.1, 0.2], [0.55, 0, 0.1, 0.1]], fov: [[0, 32], [0.55, 28]] },
    // low beside the start: it breaks away, the sand torn up behind it
    { at: 0.55, eye: [[0.55, -6, -4, 1.2], [1.35, -7, -5, 1.6]], lookFrame: 'body', look: [[0.55, 0, 0, 0.4], [1.35, 0, 0, 0.2]], lag: 4, fov: [[0.55, 46], [1.35, 52]] },
    // high and far out: the whole ring, its streaks and afterimages going round and drawing in, the crowd crushed inside it
    { at: 1.35, eye: [[1.35, -6, CENTER - 36, 30], [3.3, -2, CENTER - 32, 26]], look: [[1.35, 0, CENTER, 0], [3.3, 0, CENTER, 1]], fov: [[1.35, 48], [3.3, 44]] },
    // down inside the ring among the crowd: the wall rushing round the lens
    { at: 3.3, eye: [[3.3, 3, CENTER + 1, 2.2], [LEAP, 2, CENTER + 0.5, 2.6]], look: [[3.3, -4, CENTER - 3, 2.6], [LEAP, -3, CENTER - 4, 3.2]], fov: [[3.3, 62], [LEAP, 66]] },
    // low outside the ring: it leaps out of its own cloud and climbs, the pack's columns under it
    { at: LEAP, eye: [[LEAP, 14, CENTER - 20, 1.6], [HOVER[0], 15, CENTER - 22, 2.4]], lookFrame: 'body', look: [[LEAP, 0, 0, 0.5], [HOVER[0], 0, 0, 1.5]], lag: 5, fov: [[LEAP, 46], [HOVER[0], 38]] },
    // below and before it, looking up against the sky: the hands raised, the orb growing, the crowd's heads in the foot of the frame
    { at: HOVER[0], eyeFrame: 'body', eye: [[HOVER[0], -5, 9, -15], [HOVER[1], -3, 7.5, -13]], lookFrame: 'body', look: [[HOVER[0], 0, 0, 2.6], [HOVER[1], 0, 0, 2.2]], fov: [[HOVER[0], 46], [HOVER[1], 40]], roll: [[HOVER[0], -4], [HOVER[1], 3]] },
    // over its shoulder, looking down past it at the crowd: the throw
    { at: HOVER[1] - 0.1, eyeFrame: 'body', eye: [[HOVER[1] - 0.1, -2.6, -4.5, 4.2], [IMPACT, -2.4, -4, 4]], lookFrame: 'body', look: [[HOVER[1] - 0.1, 0, 7, -24], [IMPACT, 0, 7, -24]], fov: [[HOVER[1] - 0.1, 50], [IMPACT, 54]] },
    // the impact, wide and high: the white sun on the sand, the wave and the surge rolling out
    { at: IMPACT, eye: [[IMPACT, -30, CENTER - 26, 16], [9.3, -27, CENTER - 24, 14]], look: [[IMPACT, 0, CENTER, 2], [9.3, 0, CENTER, 3]], fov: [[IMPACT, 50], [9.3, 46]] },
    // from the ground at the glass's rim, looking up: it comes down through the cloud on its pack
    { at: 9.3, eye: [[9.3, -9, LAND_AT + 6, 1.4], [LAND + 0.4, -8, LAND_AT + 5, 2.2]], lookFrame: 'body', look: [[9.3, 0, 0, 0], [LAND + 0.4, 0, 0, 1]], lag: 6, fov: [[9.3, 44], [LAND + 0.4, 46]] },
  ],
}
