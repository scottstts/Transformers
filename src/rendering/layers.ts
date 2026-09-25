/**
 * Render layers. The view camera draws layer 0 only; the sun's shadow camera
 * draws layers 0 and SHADOW_ONLY, so a low-detail proxy placed on SHADOW_ONLY
 * casts the shadow of a detailed mesh that itself casts none (the soldier horde).
 */
export const SHADOW_ONLY_LAYER = 1
