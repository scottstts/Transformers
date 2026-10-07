/**
 * The combat interaction contract between the player's robots and the
 * enemies. Every robot and every enemy follows it through the shared
 * machinery, so nothing is written per robot or per enemy, and a new robot
 * or enemy gets it by using that machinery:
 *
 *  - robots' blows reach the world only as hit events (`HitEvent`, pulls as
 *    `PullEvent`), each marked `special` when a special throws it;
 *  - every enemy is a `Soldier` (soldier.ts) and takes them through
 *    `Soldier.impact` and `Soldier.pull`;
 *  - an enemy's blow reaches the robot through the horde (`Horde.onStruck`,
 *    `Horde.onKnockback`) and `RobotCombat`.
 *
 * The rules:
 *
 *  1. An enemy in the middle of its combo (the commander's) cannot be
 *     interrupted, except by a special: other blows take its health (and
 *     rock it), but don't flinch, throw or knock it down, and vacuums don't
 *     draw it. Its health running out destroys it (rule 4 aside).
 *  2. Otherwise every enemy takes every hit effect a soldier does (flinch,
 *     knock-back, short toss, launch, fall, vacuum, the body blows) through the same
 *     code. Its weight (`UnitTuning.push`, 1 a soldier's) only sizes how far
 *     it is knocked and lifted, and how hard it must be lifted to be thrown;
 *     a special's lift reaches every enemy whole, so a special throws them
 *     all alike.
 *  3. The commander's knock-back (its combo's fourth move) interrupts
 *     whatever the robot is doing on its feet, a combo included, except a
 *     special (a cutscene can't be fought) or a raised guard (the shield
 *     takes the blow).
 *  4. In a special, an enemy whose health its blows (or anything else)
 *     empty is held, not destroyed: it breaks apart with the rest at the
 *     special's last blow, or as the special ends.
 *  5. A combo click is accepted only when it can act now: from idle or
 *     recovery, or inside the current move's authored chain window. Early
 *     clicks are discarded; crossing a window later never revives them.
 *  6. Guard interrupts a combo immediately, before its remaining cues or
 *     hits can fire. Specials and the initial knock-back control lock keep
 *     ownership; outside those locks the shield protects on the first frame.
 *  7. E starts a grounded Flash Move in the held movement direction, else
 *     the robot's facing, travelling 2.5 standing heights over 0.18 s. It
 *     cancels combo continuation, never starts while guarding or flashing,
 *     and preserves special/knock-back locks. Guard interrupts it at once.
 *     Scenery stops its swept body. A broad impact front along the travel
 *     catches the crowd independently of mesh contact. Each enemy takes
 *     one zero-damage forward kick, varied in strength, lift and slight
 *     outward spread before weight is applied. Bodies lose their footing,
 *     pitch off-axis and keep loose limbs throughout flight. Landing starts
 *     the catch; momentum brakes naturally, with no preset destination.
 *     This doesn't use the combat launch/down/get-up sequence or cause
 *     secondary wall/body damage. A commander mid-combo keeps rule 1's
 *     protection; existing falls and special holds keep ownership.
 *     It adds no invulnerability:
 *     enemy blows still follow rules 1-4. Presses during it are discarded;
 *     a fresh E may start another as soon as it ends, without a cooldown.
 */

/** Rules 1-2: whether a blow (or a vacuum) reacts on an enemy: always, unless it is mid-combo and the blow is not a special's. */
export function enemyReacts(inCombo: boolean, special: boolean): boolean {
  return !inCombo || special
}

/** Rule 4: whether a blow that empties an enemy holds it (a special's, or any while a special plays, short of its last blow) rather than destroying it. */
export function enemyHeld(blowSpecial: boolean, specialPlaying: boolean, final: boolean): boolean {
  return (blowSpecial || specialPlaying) && !final
}

/** Rule 3: whether an enemy's knock-back reaches the robot. */
export function robotKnockedBack(robot: { readonly cinematic: boolean; readonly guarded: boolean }): boolean {
  return !robot.cinematic && !robot.guarded
}

/** Rule 5: eligibility at the press, independent of the following frame's dt. */
export function comboAcceptsClick(phase: 'idle' | 'move' | 'recover', time: number, chain?: readonly [number, number]): boolean {
  return phase !== 'move' || !!chain && time >= chain[0] && time <= chain[1]
}

/** Rule 6: guard does not wait for the combo's attack or movement windows. */
export function robotCanGuard(robot: { readonly cinematic: boolean; readonly staggered: boolean }): boolean {
  return !robot.cinematic && !robot.staggered
}

/** Rule 7: one grounded move at a time; a held guard blocks E even before its next draw. */
export function robotCanFlash(robot: { readonly cinematic: boolean; readonly staggered: boolean; readonly guarded: boolean; readonly flashing: boolean }, guardHeld: boolean, grounded: boolean): boolean {
  return grounded && !guardHeld && !robot.guarded && !robot.flashing && !robot.cinematic && !robot.staggered
}
