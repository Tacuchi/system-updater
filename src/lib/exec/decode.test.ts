import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { decodeSmart, sniff, StreamDecoder } from './decode.js';

const NUL = String.fromCharCode(0);
// @types/node 20 + TS 5.9 skew: Buffer.concat wants Uint8Array<ArrayBufferLike>[],
// and Buffer's overridden slice() trips structural variance. Cast the list once.
const cat = (...parts: Buffer[]): Buffer => Buffer.concat(parts as unknown as readonly Uint8Array[]);
const utf16leBom = (s: string): Buffer => cat(Buffer.from([0xff, 0xfe]), iconv.encode(s, 'utf16-le'));
const utf16beBom = (s: string): Buffer => cat(Buffer.from([0xfe, 0xff]), iconv.encode(s, 'utf16-be'));
const utf8Bom = (s: string): Buffer => cat(Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8'));

describe('decodeSmart', () => {
  it('returns empty string for empty/nullish input', () => {
    expect(decodeSmart(Buffer.alloc(0))).toBe('');
    expect(decodeSmart(undefined)).toBe('');
    expect(decodeSmart(null)).toBe('');
  });

  it('decodes plain UTF-8 (macOS/Linux default)', () => {
    expect(decodeSmart(Buffer.from('hello cafe n', 'utf8'))).toBe('hello cafe n');
    expect(decodeSmart(Buffer.from('acentos: cafe', 'utf8'))).toBe('acentos: cafe');
  });

  it('decodes UTF-8 with BOM and strips it', () => {
    expect(decodeSmart(utf8Bom('Name  Id  Version'))).toBe('Name  Id  Version');
  });

  it('decodes UTF-16LE with BOM (winget piped)', () => {
    const line = 'Microsoft.Edge  120.0.1  121.0.2';
    expect(decodeSmart(utf16leBom(line))).toBe(line);
  });

  it('decodes UTF-16LE WITHOUT a BOM via the NUL heuristic (the mojibake bug)', () => {
    // Without the heuristic this is read as UTF-8 and every char gets a trailing NUL.
    const line = 'Microsoft.PowerShell  7.4.0  7.4.6';
    const out = decodeSmart(iconv.encode(line, 'utf16-le'));
    expect(out).toBe(line);
    expect(out.includes(NUL)).toBe(false);
  });

  it('decodes UTF-16BE with BOM', () => {
    const line = 'Foo.Bar  1.0  2.0';
    expect(decodeSmart(utf16beBom(line))).toBe(line);
  });

  it('decodes OEM (cp850) output from a cmd-hosted tool', () => {
    // Accented bytes are invalid UTF-8 -> OEM fallback.
    const line = iconv.decode(iconv.encode('senor cafe', 'cp850'), 'cp850');
    const buf = iconv.encode('sñor cé', 'cp850');
    expect(decodeSmart(buf, 850)).toBe('sñor cé');
    expect(line).toBe('senor cafe');
  });
});

describe('sniff', () => {
  it('classifies each encoding', () => {
    expect(sniff(utf8Bom('x'))).toEqual({ enc: 'utf8', bomLen: 3 });
    expect(sniff(utf16leBom('x'))).toEqual({ enc: 'utf16-le', bomLen: 2 });
    expect(sniff(utf16beBom('x'))).toEqual({ enc: 'utf16-be', bomLen: 2 });
    expect(sniff(iconv.encode('Microsoft.Edge  120  121', 'utf16-le'))).toEqual({ enc: 'utf16-le', bomLen: 0 });
    expect(sniff(Buffer.from('plain ascii utf8', 'utf8'))).toEqual({ enc: 'utf8', bomLen: 0 });
  });
});

describe('StreamDecoder', () => {
  it('reassembles a UTF-16LE unit split across two chunks', () => {
    const text = 'winget upgrade progress '.repeat(8); // long enough to sniff on chunk 1
    const buf = iconv.encode(text, 'utf16-le');
    const cut = 99; // odd index -> splits a 2-byte code unit
    const dec = new StreamDecoder();
    const out = dec.write(buf.subarray(0, cut)) + dec.write(buf.subarray(cut)) + dec.end();
    expect(out).toBe(text);
    expect(out.includes(NUL)).toBe(false);
  });

  it('passes UTF-8 chunks through unchanged', () => {
    const dec = new StreamDecoder();
    const out = dec.write(Buffer.from('line one\n', 'utf8')) + dec.write(Buffer.from('line two', 'utf8')) + dec.end();
    expect(out).toBe('line one\nline two');
  });
});
