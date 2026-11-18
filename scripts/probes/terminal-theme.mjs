import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

export const LIMIT_MS = 150;
export function reportedTheme(colorfgbg, response = '') {
  const palette = colorfgbg?.split(';').at(-1);
  if (palette !== undefined && /^\d+$/.test(palette)) return [7, 10, 11, 14, 15].includes(Number(palette)) ? 'light' : 'dark';
  const match = response.match(/\x1b\]11;rgb:([a-f\d]+)\/([a-f\d]+)\/([a-f\d]+)(?:\x07|\x1b\\)/i);
  if (!match) return 'dark';
  const linear = match.slice(1).map(value => {
    const channel = parseInt(value, 16) / (16 ** value.length - 1);
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .5 ? 'light' : 'dark';
}
async function measure() {
  const start = performance.now();
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { theme: 'dark', source: 'non-tty', elapsedMs: 0 };
  if (process.env.COLORFGBG) return { theme: reportedTheme(process.env.COLORFGBG), source: 'COLORFGBG', elapsedMs: 0 };
  const raw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  let response = '';
  await new Promise(resolve => {
    const finish = () => { clearTimeout(timer); process.stdin.off('data', data); resolve(); };
    const data = chunk => {
      response += chunk.toString();
      if (/\x1b\[[?\d;]*c/.test(response)) finish();
    };
    const timer = setTimeout(finish, LIMIT_MS);
    process.stdin.on('data', data);
    process.stdout.write('\x1b]11;?\x07\x1b[c');
  });
  process.stdin.setRawMode(raw);
  process.stdin.pause();
  return { theme: reportedTheme(undefined, response), source: response.includes(']11;') ? 'OSC11' : 'fallback', elapsedMs: Math.round(performance.now() - start), responseBytes: Buffer.byteLength(response) };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fixtures')) {
    assert.equal(reportedTheme('0;15'), 'light');
    assert.equal(reportedTheme('15;0'), 'dark');
    assert.equal(reportedTheme(undefined, '\x1b]11;rgb:ffff/ffff/ffff\x1b\\\x1b[?1;2c'), 'light');
    assert.equal(reportedTheme(undefined, '\x1b]11;rgb:0000/0000/0000\x07'), 'dark');
    assert.equal(reportedTheme(undefined, '\x1b[?1;2c'), 'dark');
    assert.equal(reportedTheme(undefined), 'dark');
    console.log('6 recorded theme cases passed; timeout 150ms; no-response => dark');
  } else console.log(JSON.stringify(await measure()));
}
