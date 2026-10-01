# Assets

Every file the game downloads (models, weapons, the soldiers, the citadel) lives on the asset CDN (Cloudflare R2, `base` in `src/assets/catalog.json`), never in the repo or the deployed site. Git history holds no exported assets.

## Loading (`src/assets/`)

- `catalog.json` lists every file with its size and SHA-256. Code names a file by its catalog key (`AssetFile`), so a file that is not catalogued is a type error, or a thrown error for names built at run time (`assetFile`).
- `fetchAssetBytes` / `fetchAssetJson` / `fetchModel` (`<name>.json` + `<name>.bin`) are the only ways to load a file. Requests for the same file in flight share one download. Network errors, server faults and the rate limit (429) are retried 3 times with growing waits. A 404 or 403 is not retried. Errors name the asset, the file and the base URL.
- A file's URL carries the first 16 hex digits of its hash (`?v=`), so no cache serves an old version after an upload. The bytes must match the catalogued size: a stale upload or a cut-off transfer fails at boot with that reason, never as a decode error later.
- Downloads are not kept after they resolve. Callers keep what they decode (the roster caches each car's promise).
- The bucket's CORS policy must allow every origin that runs the game (the site and `http://localhost:5173`). It only needs `GET`: the loader sends simple requests, so there is no preflight.

## The local mirror (`assets/`, gitignored)

- Blender exports write into `assets/`. Tests and tools read from it (`tools/mirror.ts`), never from the network.
- `node tools/assets.mjs pull` fills it from the CDN, downloading only missing or stale files, and checks each hash. The test run's global setup (`tests/support/pull-assets.ts`) does this first, so a fresh clone tests without setup.
- `VITE_ASSET_BASE=/local-assets npm run dev` plays the mirror instead of the CDN (a dev-server route, `vite.config.js`).

## Publishing an export

1. Export from Blender (writes `assets/<name>.*`).
2. `node tools/assets.mjs catalog`: rehash the mirror into `catalog.json`. `status` lists what differs from the catalog.
3. Upload the changed files to the bucket under the same names.
4. `node tools/assets.mjs verify`: every catalogued file on the CDN matches its hash.

Commit `catalog.json` with the code that needs the new files. The game requests the catalogued hash. Until the upload is done, the size check fails (or the old file loads, if the size happens to match), so do steps 3 and 4 before deploying.
