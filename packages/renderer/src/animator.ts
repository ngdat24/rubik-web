/** Smoothstep: zero velocity at both endpoints. Pure and independent of RAF/WebGL. */
export function animationProgress(elapsedMs: number, durationMs: number): number {
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  return t * t * (3 - 2 * t);
}

/** Integrate progress instead of changing the origin time: speed changes cannot rewind a turn. */
export function advanceProgress(progress: number, deltaMs: number, msPerQuarterTurn: number, doubleTurn: boolean, waiting: number): number {
  const duration = msPerQuarterTurn * (doubleTurn ? 1.5 : 1) / (1 + waiting * 0.6);
  return Math.min(1, progress + Math.max(0, deltaMs) / duration);
}
