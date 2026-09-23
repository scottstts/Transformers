import { createMaterials } from '../src/content/cybertruck/materials.ts';
import { CybertruckModel } from '../src/content/cybertruck/model/transformer.ts';

const bot = new CybertruckModel(createMaterials());
const parts = [...bot.boneOrder.map((bone) => bone.group), ...bot.panels.map((panel) => panel.group)];
const sample = (t) => {
  bot.pose(t, null);
  for (const part of parts) {
    if (!part.matrixWorld.elements.every(Number.isFinite)) throw new Error(`non-finite pose at T=${t}: ${part.name}`);
  }
  if (!Number.isFinite(bot.lift)) throw new Error(`non-finite ground lift at T=${t}`);
};

sample(0);
const folded = parts.map((part) => [...part.matrixWorld.elements]);
for (let i = 1; i <= 100; i++) sample(i / 100);
for (let i = 99; i >= 0; i--) sample(i / 100);
let worst = 0;
for (let i = 0; i < parts.length; i++) {
  for (let j = 0; j < 16; j++) worst = Math.max(worst, Math.abs(parts[i].matrixWorld.elements[j] - folded[i][j]));
}
if (worst > 1e-5) throw new Error(`reverse transformation did not return to fold pose: ${worst}`);
console.log(`201 forward/reverse poses, ${parts.length} moving groups: ok`);
