import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../src/', import.meta.url);
for (const name of readdirSync(root).filter(name => name.endsWith('.ts'))) {
  const source = readFileSync(new URL(name, root), 'utf8');
  if (/from\s+['"]react|new\s+Cube\s*\(|\bapplyMoves?\s*\(/.test(source)) {
    throw new Error(`${name}: renderer must not own Cube, apply moves, or depend on React`);
  }
}
console.log('Renderer boundary OK.');
