#!/usr/bin/env node
// Postbuild guard: the published bin (dist/cli.js) must start with an LF shebang.
// A CRLF shebang ("#!/usr/bin/env node\r") makes Unix exec fail with a bad
// interpreter, which is exactly the kind of Windows-checkout regression that a
// missing .gitattributes used to cause.
import { readFileSync } from 'node:fs';

const file = 'dist/cli.js';
let firstLine;
try {
  firstLine = readFileSync(file, 'utf-8').split('\n', 1)[0] ?? '';
} catch (err) {
  console.error(`✗ ${file}: cannot read (${err.message}). Did the build run?`);
  process.exit(1);
}

if (!firstLine.startsWith('#!/usr/bin/env node')) {
  console.error(`✗ ${file}: missing/incorrect shebang: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (firstLine.includes('\r')) {
  console.error(`✗ ${file}: shebang has a CR (CRLF) — must be LF.`);
  process.exit(1);
}
console.log(`✓ ${file}: LF shebang OK`);
