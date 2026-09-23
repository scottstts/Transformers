// T=0 containment: every robot-structure vertex must be inside the truck shell.
import * as THREE from 'three/webgpu';
import { createMaterials } from '../src/content/cybertruck/materials.ts';
import { CybertruckModel } from '../src/content/cybertruck/model/transformer.ts';
import { insideShell } from '../src/content/cybertruck/model/vehicle-body.ts';
const bot = new CybertruckModel(createMaterials());
bot.pose(0, null);
const v = new THREE.Vector3();
const bad = {};
for (const b of bot.boneOrder) b.group.children.forEach((mesh, mi) => {
  const pos = mesh.geometry.attributes.position;
  let n = 0, worst = null;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(b.group.matrix);
    if (!insideShell(v.x, v.y, v.z, 0.01)) { n++; if (!worst || v.y > worst.y) worst = v.clone(); }
  }
  if (n) bad[`${b.name}#${mi}(${mesh.material.userData.preview?.toString(16)})`] = `${n}/${pos.count} e.g. (${worst.x.toFixed(2)}, ${worst.y.toFixed(2)}, ${worst.z.toFixed(2)})`;
});
if (Object.keys(bad).length) {
  console.error(bad);
  process.exitCode = 1;
} else console.log('all robot structure inside the shell');
