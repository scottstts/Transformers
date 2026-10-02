# Rendering and startup

The app uses Three's WebGPU backend and TSL node materials. The WebGL fallback is disabled immediately after construction. Device loss and uncaptured GPU errors retain Three's default bookkeeping and logging, then stop the game through the existing error UI.

Desktop Chromium with mouse input is required. The platform gate runs before the dynamic game import; unsupported browsers remain on the entry artwork. Startup observes module import, renderer initialization, CDN assets, world construction, audio preparation, shader warm-up, first render and queue completion as one promise chain. The selected vehicle is ready only when its weapon is also decoded.

Normal loading text is “Loading assets,” “Preparing game,” or “Starting game.” Internal stages and technical details are retained for failure diagnostics. Seven ordered boot phases drive the entry gauge; repeated download-progress callbacks never increment it. Once ready, the scene opens on the car's low broadside (`FollowCamera.showSide`), with the entry type in the sky and controls below. Enter requests pointer lock; play starts on lock change, so a refused lock leaves a usable button.

## Warm-up and light identity

`GameSession.compile` reveals every world LOD, enemy tier, empty effect pool and hidden weapon, then disables culling for `compileAsync` and a real draw through the post pipeline. The draw uploads geometry and builds shadow/post target pipelines that compilation alone does not cover. Covered settle frames reassert warm visibility after simulation, since updates hide idle effects.

A first vehicle switch uses the same covered path; cached cars switch synchronously. Covered draws come from the animation loop: Three's scene pass updates once per frame, so drawing again after an awaited switch can reuse the old pass. World simulation stops during loading, so enemies cannot act behind the cover.

The scene has three fixed point-light slots (`light-slots.ts`). Character lights are adopted from untransformed parents, then copied onto those slots. Replacing a light object invalidates lit shaders even if its type and settings match; never replace scene light identities during a car switch. `switch-probe.mjs --all` checks all twelve ordered switches and then exercises commanders, world classes and effects, requiring zero shader and pipeline builds in play.

## Temporal anti-aliasing and image order

MSAA is disabled because the temporal resolve owns scene sampling. A full-resolution HDR scene pass carries color, depth and RGBA motion: XY is unjittered NDC motion, Z is reactive coverage, and W is fragment opacity for correct transparent blending. Three's 32-sample Halton jitter, depth rejection, neighborhood variance clipping and luminance weighting resolve subpixel silhouettes and shaded detail. The subpixel-correction option is disabled to avoid a repeating square pattern.

Rigid meshes use previous model matrices. Custom horde skinning supplies previous bone/state data by body identity, not current packed slot; otherwise sorting or LOD changes invent motion. Morph meshes supply previous shape weight. Terrain supplies its static displaced position even when patch instances reorder. Analytic particles and casings are reactive when they do not supply a previous deformed position. Transparent coverage is reactive automatically.

The resolve rejects history where current or prior reactive coverage is present. Prior coverage lives in the history texture's alpha, so a disappearing flash or particle also clears without a new texture or pass. That alpha is metadata, not image opacity: restore opaque alpha before `renderOutput`, whose color conversion unpremultiplies and premultiplies its input. History resets explicitly on car swaps and cinematic transitions, and automatically on large camera/lens changes or a render pause. Native target resize initializes fresh history. Jitter is restored after each frame so camera rays and gameplay use the authored projection.

Resolved linear HDR feeds bloom. The bright pass uses a quadratic soft knee, avoiding a hard contour in the dusty sky at the threshold. Heat shimmer, lens refraction and blast exposure occur after scene history. ACES tone mapping and output conversion have one owner (`renderOutput`), then the display-referred film grade adds contrast, cool shadows, warm highlights, vignette and grain. Presentation grain and refraction therefore never accumulate in scene history.

Resizes commit through one `setDrawingBufferSize` call per animation frame. Base DPR is capped at 1.7 and at 4,000,000 drawing-buffer pixels, including when that requires DPR below 1. Temporal AA uses this same capped buffer; it does not raise resolution or add a lower-quality fallback.

## Shadows and indirect light

`SunShadowNode` takes the darker of moving-caster cascades and cached static citadel maps. Moving casters retain three 2048² cascades to 150 m, including enemy proxies on `SHADOW_ONLY_LAYER`; splits follow camera lens changes.

Static maps have half-widths 24/110/190/900 m and widths 2048/4096/4096/2048 texels. Their 16-bit depth and unused R8 color attachments total about 115 MiB. Map centers snap to texel-aligned steps of one tenth of a level. The finest refreshes whenever needed; coarser maps share one refresh per frame. Shader containment and map placement publish the same committed center; pending refreshes never move containment ahead of the map. Empty maps can follow empty desert without drawing.

Depth coverage derives from the full caster-height range (150 m plus vertical padding), sun elevation and committed light-space Y rectangle. Snapping camera depth independently could clip tall upstream towers and nearby ground, making wall shadows disappear while moving. Depth bias is a world distance plus two quantization steps, normalized per map's span; normal bias scales with half a texel. Filter radius preserves the same penumbra width in metres.

View LOD and shadow LOD are independent. A static shadow draw exposes only the caster classes its texel footprint supports, then restores view visibility. Camera-distance toggles do not invalidate caches or remove off-screen casters whose shadows reach visible ground. Entry warm-up draws every static pass with every eligible caster; mass/articulation reach the coarse map, and detail the three finer ones.

Only contributing levels are filtered, with smooth cross-fades. The filter preserves Three r186's five Vogel samples with hardware four-tap PCF. A localized TextureNode bridge emits `textureSampleCompareLevel` because r186 ignores `.level(0)` for comparisons. Explicit level-zero sampling permits per-pixel selection without derivative-dependent sampling; the maps have no mip levels. This saves redundant shadow reads without changing resolution or the filter.

Citadel AO is a one-time world-space visibility bake, applied through `aoNode` only to indirect lighting (citadel.md). Atlas packing keeps the material below default WebGPU sampled-texture limits. Thin projected faces rasterize crossed cells, preventing diagonal walls from inventing filled rectangles. The environment is the atmosphere's sky and sunlit ground at intensity 1; no extra hemisphere light doubles that fill.

## Evidence and budgets

Headless tools advance Three's node frame before each draw, use fixed camera bookmarks and seed, and preserve fatal GPU error reporting. `aa-probe.mjs` checks temporal subpixel stability and reactive disappearance. `citadel-render.mjs` captures near/design/far gate views and final/no-post/no-AO/no-shadow isolation, then measures real asset motion stability. `citadel-bench.mjs` and `dust-bench.mjs` measure CPU submit and queue-complete wall time alongside a whole-queue GPU timestamp span. The span includes queue idle gaps while JS submits; it is not summed GPU busy time. They also report steady queued averages, allowing CPU submission and GPU execution to overlap. Per-frame fences measure serialized latency and cannot represent steady frame rate. The citadel bench requires the queued average plus CPU simulation to stay under 33 ms at every bookmark. Three's per-pass totals can overlap on Metal and must not be reported as frame elapsed time. Cold headless boot includes driver compilation and excludes CDN transfer; it is not a browser loading-time estimate.
