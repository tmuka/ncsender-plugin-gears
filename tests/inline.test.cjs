const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('config.html carries the current lib/*.cjs', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [path.join(__dirname, '..', '.scripts', 'inline.cjs'), '--check'], { stdio: 'pipe' }));
});
