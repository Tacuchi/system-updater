// Kitty graphics probe for the header banner. Never runs the app or any package manager.
//   node scripts/probes/terminal-image.mjs --fixtures   recorded answers and exact command bytes, no terminal
//   node scripts/probes/terminal-image.mjs [--write f]  asks the current terminal (150 ms limit) and prints JSON (also to f)
//   node scripts/probes/terminal-image.mjs --placement  shows, by eye, the ghost a new cursor placement per frame leaves
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

export const LIMIT_MS = 150;
const ESC = '\x1b';
const ST = `${ESC}\\`;
export const QUERY = `${ESC}_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA${ST}`;
const DIACRITICS = [0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f].map(code => String.fromCodePoint(code));

export function answered(response) {
  const answer = response.indexOf(`${ESC}_Gi=31;OK${ST}`);
  const attributes = response.search(/\x1b\[[?\d;]*c/);
  return answer !== -1 && attributes !== -1 && answer < attributes;
}
export function transmit(id, png, columns, rows, keys = 'U=1,') {
  const chunks = png.match(/.{1,4096}/gs) ?? [];
  return chunks.map((chunk, index) => {
    const more = index < chunks.length - 1 ? 1 : 0;
    const head = index === 0 ? `a=T,${keys}f=100,t=d,i=${id},c=${columns},r=${rows},C=1,q=2,m=${more}` : `m=${more}`;
    return `${ESC}_G${head};${chunk}${ST}`;
  }).join('');
}
export const remove = id => `${ESC}_Ga=d,d=I,i=${id},q=2${ST}`;
export const placeholders = (id, columns, rows) => Array.from({ length: rows }, (_, row) =>
  `${ESC}[38;5;${id}m${Array.from({ length: columns }, (_, column) => '\u{10EEEE}' + DIACRITICS[row] + DIACRITICS[column]).join('')}${ESC}[39m`);

async function ask() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { images: false, source: 'non-tty', elapsedMs: 0 };
  const start = performance.now();
  const raw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  let response = '';
  await new Promise(resolve => {
    const finish = () => { clearTimeout(timer); process.stdin.off('data', data); resolve(); };
    const data = chunk => { response += chunk.toString(); if (/\x1b\[[?\d;]*c/.test(response)) finish(); };
    const timer = setTimeout(finish, LIMIT_MS);
    process.stdin.on('data', data);
    process.stdout.write(QUERY + `${ESC}[c`);
  });
  process.stdin.setRawMode(raw);
  process.stdin.pause();
  return {
    images: answered(response),
    graphicsAnswer: response.includes(`${ESC}_G`) ? (response.includes(';OK') ? 'OK' : 'error') : 'none',
    deviceAttributes: /\x1b\[[?\d;]*c/.test(response),
    elapsedMs: Math.round(performance.now() - start),
    responseBytes: Buffer.byteLength(response),
    env: { TERM: process.env.TERM ?? null, TERM_PROGRAM: process.env.TERM_PROGRAM ?? null, TMUX: Boolean(process.env.TMUX) },
  };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Draws a three-line frame the way Ink does on every render: erase the previous
// frame line by line (EL 2 + cursor up), then write the new one.
function frame(lines, previous) {
  let erase = '';
  for (let i = 0; i < previous; i++) erase += `${ESC}[2K` + (i < previous - 1 ? `${ESC}[1A` : '') ;
  process.stdout.write(erase + '\r' + lines.join('\n') + '\n');
}
async function placement() {
  const result = await ask();
  if (!result.images) { console.log(`No kitty graphics answer: ${JSON.stringify(result)}`); return; }
  const png = readFileSync('src/lib/brand-images.ts', 'utf8').match(/export const darkIsotype = '([^']+)'/)[1];
  const text = ['tacuchi updater 3.0.1', 'macOS · 7 gestores detectados', 'Paso 1/4 · Detectando gestores'];
  const cleanup = () => process.stdout.write(remove(101) + remove(102));
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(130));

  console.log('\nA. Cursor placement. Ink then erases the frame and writes it one row lower:');
  frame(text.map(line => ' '.repeat(12) + line), 0);
  process.stdout.write(`${ESC}[3A${ESC}[3G` + transmit(101, png, 8, 3, '') + `${ESC}[3B\r`);
  await sleep(1500);
  frame(['', ...text.map(line => ' '.repeat(12) + line)], 4);
  console.log('   If an image stayed one row above the text, that is the ghost Ink would leave.');
  await sleep(1500);

  console.log('\nB. Unicode placeholders, same redraw:');
  process.stdout.write(transmit(102, png, 8, 3));
  const rows = placeholders(102, 8, 3);
  frame(text.map((line, i) => '  ' + rows[i] + '  ' + line), 0);
  await sleep(1500);
  frame(['', ...text.map((line, i) => '  ' + rows[i] + '  ' + line)], 4);
  console.log('   The image should move with its text: one image, aligned, no ghost.');
  await sleep(1500);
  console.log('\nThe probe deletes both images on exit.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fixtures')) {
    assert.equal(answered(`${ESC}_Gi=31;OK${ST}${ESC}[?62;22c`), true);
    assert.equal(answered(`${ESC}[?62;22c`), false);
    assert.equal(answered(`${ESC}[?62;22c${ESC}_Gi=31;OK${ST}`), false);
    assert.equal(answered(`${ESC}_Gi=31;EINVAL:bad${ST}${ESC}[?62;22c`), false);
    const bytes = transmit(42, 'A'.repeat(5000), 8, 3);
    assert.equal(bytes.split(`${ESC}_G`).length - 1, 2);
    assert.ok(bytes.startsWith(`${ESC}_Ga=T,U=1,f=100,t=d,i=42,c=8,r=3,C=1,q=2,m=1;`));
    assert.equal(remove(42), `${ESC}_Ga=d,d=I,i=42,q=2${ST}`);
    assert.equal(placeholders(42, 8, 3)[2].split('\u{10EEEE}').length - 1, 8);
    console.log('8 recorded graphics cases passed; answer must precede DA1; 4096-byte chunks; delete frees data');
  } else if (process.argv.includes('--placement')) await placement();
  else {
    const result = JSON.stringify(await ask());
    const target = process.argv[process.argv.indexOf('--write') + 1];
    if (process.argv.includes('--write') && target) writeFileSync(target, result + '\n');
    console.log(result);
  }
}
