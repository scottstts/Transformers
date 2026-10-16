// Cut a reference image and its line-check overlay into zoomed side-by-side
// tiles for close inspection: node tools/ref-tiles.mjs <ref.png> <overlay.png> <outdir> [tile=200] [zoom=4] [x0,y0,x1,y1]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const [ref, ovl, out, tileArg = '200', zoomArg = '4', boxArg] = process.argv.slice(2)
const tile = Number(tileArg), zoom = Number(zoomArg)
const [x0, y0, x1, y1] = (boxArg ?? '0,0,2600,800').split(',').map(Number)
mkdirSync(out, { recursive: true })
for (let y = y0; y < y1; y += tile) {
  for (let x = x0; x < x1; x += tile) {
    const crop = `crop=${tile}:${tile}:${x}:${y},scale=${tile * zoom}:${tile * zoom}:flags=neighbor`
    const name = `${out}/t_${String(x).padStart(4, '0')}_${String(y).padStart(4, '0')}.png`
    execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-y', '-i', ref, '-i', ovl, '-filter_complex',
      `[0:v]${crop}[a];[1:v]${crop}[b];[a][b]hstack`, name])
  }
}
