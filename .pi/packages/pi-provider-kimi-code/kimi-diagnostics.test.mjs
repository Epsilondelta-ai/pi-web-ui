import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

// Strip the kimiDebug function so its own console.error is not flagged
const withoutKimiDebug = source.replace(/function kimiDebug\s*\([^)]*\)\s*\{[\s\S]*?\n\}/, '');

const lines = withoutKimiDebug.split('\n');
const violations = [];
for (let i = 0; i < lines.length; i++) {
  if (/console\.(error|log|warn)/.test(lines[i]) && lines[i].includes('[kimi-coding]')) {
    // Skip debug-gated console calls (e.g. `if (debug) console.log(...)`)
    const beforeConsole = lines[i].slice(0, lines[i].indexOf('console.'));
    if (/if\s*\(\s*debug\s*\)/.test(beforeConsole)) continue;
    violations.push(`Line ${i + 1}: ${lines[i].trim()}`);
  }
}

assert.deepStrictEqual(violations, [], `Raw [kimi-coding] diagnostics found outside kimiDebug:\n${violations.join('\n')}`);

console.log('kimi diagnostics regression ok');
