import { createMaterials } from '../src/content/cybertruck/materials.ts';
import { CybertruckModel } from '../src/content/cybertruck/model/transformer.ts';
import { CybertruckGait } from '../src/content/cybertruck/animation/gait.ts';

const bot = new CybertruckModel(createMaterials());
const gait = new CybertruckGait();
let footfalls = 0;
for (const [speed, running] of [[3.4, false], [7.5, true]]) {
  for (let frame = 0; frame < 180; frame++) {
    bot.pose(1, gait.update(1 / 60, speed, 0, running, true));
    for (const bone of bot.boneOrder) {
      if (!bone.group.matrixWorld.elements.every(Number.isFinite)) throw new Error(`invalid gait pose at frame ${frame}`);
    }
    if (!Number.isFinite(bot.lift)) throw new Error(`invalid ground lift at frame ${frame}`);
    footfalls += gait.events.length;
    gait.events.length = 0;
  }
}
if (footfalls < 2) throw new Error(`expected footfalls, got ${footfalls}`);
console.log(`360 locomotion frames, ${footfalls} footfalls: ok`);
