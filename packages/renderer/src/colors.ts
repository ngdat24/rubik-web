/** Display colors in engine face order U R F D L B. */
export type ColorTheme = readonly [number, number, number, number, number, number];
export const WESTERN_COLORS: ColorTheme = Object.freeze([
  0xf5f5ed, 0xc92a34, 0x168751, 0xffd13b, 0xf08022, 0x2466c5,
]);

export function validateTheme(theme: ColorTheme): void {
  if (theme.length !== 6 || theme.some(color => !Number.isInteger(color) || color < 0 || color > 0xffffff)) {
    throw new RangeError('Theme must contain six RGB colors');
  }
}

/** Validate only the display representation, without calculating cube state. */
export function validateDisplayState(state: Uint8Array, size: number): void {
  if (state.length !== 6 * size * size || state.some(color => color > 5)) {
    throw new RangeError('State must match the display size with colors 0..5');
  }
}

/** Pure mapping used by reference tests and other non-WebGL consumers. */
export function stateToColors(state: Uint8Array, theme: ColorTheme = WESTERN_COLORS): Uint32Array {
  const size = Math.sqrt(state.length / 6);
  if (!Number.isInteger(size) || size < 2 || size > 10) throw new RangeError('Invalid display state size');
  validateTheme(theme);
  validateDisplayState(state, size);
  return Uint32Array.from(state, color => theme[color]!);
}
