import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(root).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'test-vectors.ts');
const failures = [];
for (const name of files) {
  const source = readFileSync(resolve(root, name), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  for (const match of source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('./') || specifier.includes('test-vectors') || !specifier.endsWith('.js')) {
      failures.push(`${name}: forbidden dependency ${specifier}`);
    }
  }
  if (/\b(?:import|require)\s*\(/.test(source)) failures.push(`${name}: dynamic imports/require are forbidden`);
  if (/\bMath\s*(?:\.\s*random|\[\s*['"]random['"]\s*\])/.test(source)) failures.push(`${name}: Math.random is forbidden`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Engine boundary OK: ${files.length} files; no external imports or Math.random. DOM/Node globals are excluded by tsconfig.`);
