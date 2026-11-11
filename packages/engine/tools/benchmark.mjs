import { performance } from 'node:perf_hooks';
import { solvedState, compileMove, applyPermutationInto, hash } from '../dist/index.js';

// Host-only harness. Core engine has no timer, console or Node dependency.
for (const size of [3, 10]) {
  const moves = size === 3 ? ['R','U',"F'",'M','x'] : ['R','3Uw',"5Fw'",'2R','x'];
  const permutations = moves.map(move => compileMove(move, size));
  let source = solvedState(size), output = new Uint8Array(source.length);
  const count = 1_000_000;
  const run = n => {
    for (let i = 0; i < n; i++) {
      applyPermutationInto(source, permutations[i % permutations.length], output);
      [source, output] = [output, source];
    }
  };
  run(10000);
  const start = performance.now();
  run(count);
  const ms = performance.now() - start;
  console.log(JSON.stringify({ size, moves: count, ms: Math.round(ms), movesPerSecond: Math.round(count * 1000 / ms), stateHash: hash(source) }));
}
