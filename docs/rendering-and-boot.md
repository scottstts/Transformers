# Rendering and startup

The app uses Three's WebGPU backend and TSL node materials. The renderer's built-in WebGL fallback is disabled immediately after construction, and initialization verifies that a WebGPU device was obtained. Device loss and uncaptured GPU errors retain Three's default logging and also stop the game through the app's error path.

Startup remains observed through dynamic module loading, renderer initialization, scene creation, shader compilation, first render, and GPU queue completion. The temporary loading overlay becomes a diagnostic error view on failure; normal play has no HUD or gameplay buttons.

Resizes commit once per animation frame through `setDrawingBufferSize`. The base DPR is capped at 1.7 and at 4,000,000 drawing-buffer pixels, including when the resulting DPR is below 1. The scene uses ACES tone mapping, a node bloom pass, and a soft vignette.
