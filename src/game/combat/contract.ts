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
 *     knock-back, launch, fall, vacuum, the body blows) through the same
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
