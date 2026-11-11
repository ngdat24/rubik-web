import vectors from '../../../docs/spec/vectors.json' with { type: 'json' };

/** Test-only fixture access; not part of the engine's public API. */
export function loadVectors() {
  return vectors;
}
