"""Read-only Python-vs-TypeScript checks; no cross BFS or fixture overwrites."""
import importlib.util
import json
from pathlib import Path
import random
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reference', ROOT / 'tools/reference/ref.py')
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)
ref.selftest()
vectors = json.loads((ROOT / 'docs/spec/vectors.json').read_text(encoding='utf-8-sig'))
for key, fn in [('parse', ref.vec_parse), ('apply', ref.vec_apply), ('metrics', ref.vec_metrics),
                ('stats', ref.vec_stats), ('predicates', ref.vec_predicates), ('score', ref.vec_score),
                ('scramble', ref.vec_scramble_draft)]:
    assert vectors[key] == fn(), key
prng, node_ok = ref.vec_prng()
assert node_ok and vectors['prng'] == prng
tables = json.loads((ROOT / 'docs/spec/07-tables.json').read_text(encoding='utf-8-sig'))
assert all(tables[key] == ref.T07[key] for key in ['edges', 'corners', 'faces'])

rng = random.Random(20261111)
cases = []
for size in range(2, 11):
    tokens = list('URFDLBxyz')
    if size == 3:
        tokens += list('MES')
    if size > 2:
        tokens += [f'{layer}{face}' for face in 'URFDLB' for layer in range(2, size + 1)]
        tokens += [f'{width}{face}w' for face in 'URFDLB' for width in range(2, size)]
    for _ in range(1000 if size == 3 else 20):
        moves = ' '.join(rng.choice(tokens) + rng.choice(['', "'", '2']) for _ in range(rng.choice([1, 2, 3, 8, 20, 50])))
        cases.append(dict(size=size, moves=moves))

script = r"""
import { readFileSync } from 'node:fs';
import * as engine from './packages/engine/dist/index.js';
const cases = JSON.parse(readFileSync(0, 'utf8'));
const results = cases.map(c => {
  const state = engine.applyMoves(engine.solvedState(c.size), c.moves, c.size);
  const result = {state: engine.toString(state), solved: engine.isSolved(state, c.size)};
  if (c.size === 3) {
    result.cross = Array.from({length: 6}, (_, f) => engine.crossSolved(state, f));
    result.pairs = Array.from({length: 6}, (_, f) => Array.from({length:4}, (_, s) => engine.pairSolved(state, f, s)));
    result.f2l = Array.from({length: 6}, (_, f) => engine.f2lSolved(state, f));
  }
  return result;
});
console.log(JSON.stringify(results));
"""
result = subprocess.run([shutil.which('node'), '--input-type=module', '-e', script], input=json.dumps(cases),
                        capture_output=True, text=True, cwd=ROOT, check=True)
actual = json.loads(result.stdout)
for case, got in zip(cases, actual, strict=True):
    state = ref.run(case['moves'], case['size'])
    assert got['state'] == ref.state_str(state), case
    assert got['solved'] == ref.is_solved(state, case['size']), case
    if case['size'] == 3:
        assert got['cross'] == [ref.g_cross(state, face) for face in range(6)], case
        assert got['f2l'] == [ref.g_f2l(state, face) for face in range(6)], case
        assert got['pairs'] == [[ref.t_pair(state, face, slot) for slot in range(4)] for face in range(6)], case
print(f'Reference fixtures and Node PRNG match; differential check OK: {len(cases)} sequences, N=2..10 (1000 on 3x3).')
print('matchScramble_draft excluded as agreed; no cross BFS executed.')
