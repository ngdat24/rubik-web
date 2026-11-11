/** Smoothstep: zero velocity at both endpoints. Pure and independent of RAF/WebGL. */
export function animationProgress(elapsedMs: number, durationMs: number): number {
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  return t * t * (3 - 2 * t);
}
