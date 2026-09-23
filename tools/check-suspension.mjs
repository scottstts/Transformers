// car mode with a pitched/rolled suspension: tyres must stay on the ground, body must tilt
import * as THREE from 'three/webgpu';
import { createMaterials } from '../src/content/cybertruck/materials.ts';
import { CybertruckModel } from '../src/content/cybertruck/model/transformer.ts';
const bot = new CybertruckModel(createMaterials());
bot.suspension.makeTranslation(0, 0.7, 0).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.04, 0, -0.05))).multiply(new THREE.Matrix4().makeTranslation(0, -0.7, 0));
bot.steer = 0.4; bot.spin = 1.3;
bot.pose(0, null);
for (const w of bot.wheels) {
  const p = new THREE.Vector3().setFromMatrixPosition(w.group.matrixWorld);
  if (Math.abs(p.y - 0.445) > 0.001) throw new Error(`${w.name} lost ground contact: ${p.y}`);
}
const hood = bot.panels.find(p => p.name === 'hoodR');
if (hood.group.matrixWorld.equals(new THREE.Matrix4())) throw new Error('hood did not follow the suspension');
console.log('suspension contacts and body movement: ok');
