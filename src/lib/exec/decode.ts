import iconv from 'iconv-lite';

/**
 * Decode child-process output bytes into a string, sniffing the encoding.
 *
 * macOS/Linux tools emit UTF-8; Windows tools do not:
 * - winget's *piped* output is UTF-16LE (often with a BOM).
 * - cmd-hosted tools (choco/scoop on a legacy console) emit the OEM codepage
 *   (437/850/1252/932/936…).
 * Decoding any of these as UTF-8 yields mojibake or `N\0A\0M\0E`, which makes the
 * offset/column parsers silently return `[]`.
 *
 * Sniff order matters: UTF-16LE ASCII text is *full of NUL bytes*, and a NUL is a
 * perfectly valid UTF-8 code point, so a naive UTF-8 validity check would accept
 * UTF-16 and reproduce the mojibake. The UTF-16 heuristic therefore runs BEFORE
 * the strict-UTF-8 check:
 *   BOM (UTF-8 / UTF-16LE / UTF-16BE) → NUL heuristic (UTF-16LE) → strict UTF-8 → OEM.
 *
 * Inputs are typed as Node `Buffer` (execa with `encoding:'buffer'` yields Buffers);
 * the exact winget encoding and active OEM codepage on a given machine are
 * empirically-gated (validate on real Windows). Default OEM is cp437.
 */

const DEFAULT_OEM = 437;

/** UTF-16LE ASCII has a NUL in (almost) every odd byte position. */
function looksLikeUtf16LE(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096);
  if (n < 4) return false;
  let oddZeros = 0;
  let oddTotal = 0;
  for (let i = 1; i < n; i += 2) {
    oddTotal++;
    if (buf[i] === 0) oddZeros++;
  }
  return oddTotal > 0 && oddZeros / oddTotal > 0.6;
}

/** Strict UTF-8 validity (fatal decode throws on any malformed sequence). */
function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function oemEncoding(oem: number): string {
  const name = `cp${oem}`;
  return iconv.encodingExists(name) ? name : 'utf8';
}

/** Returns the iconv encoding name + the BOM length to strip. */
export function sniff(buf: Buffer, oem: number = DEFAULT_OEM): { enc: string; bomLen: number } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { enc: 'utf8', bomLen: 3 };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { enc: 'utf16-le', bomLen: 2 };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { enc: 'utf16-be', bomLen: 2 };
  if (looksLikeUtf16LE(buf)) return { enc: 'utf16-le', bomLen: 0 };
  if (isValidUtf8(buf)) return { enc: 'utf8', bomLen: 0 };
  return { enc: oemEncoding(oem), bomLen: 0 };
}

/** One-shot decode of a fully-buffered output (detect/listOutdated path). */
export function decodeSmart(buf: Buffer | undefined | null, oem: number = DEFAULT_OEM): string {
  if (!buf || buf.length === 0) return '';
  const { enc, bomLen } = sniff(buf, oem);
  return iconv.decode(bomLen ? buf.subarray(bomLen) : buf, enc);
}

/**
 * Incremental decoder for streamed chunks. Sniffs the encoding on the first
 * non-empty chunk, then uses iconv's stateful decoder so a multi-byte unit split
 * across two chunks is not corrupted.
 */
export class StreamDecoder {
  private dec: ReturnType<typeof iconv.getDecoder> | null = null;
  constructor(private readonly oem: number = DEFAULT_OEM) {}

  write(chunk: Buffer): string {
    if (!chunk || chunk.length === 0) return '';
    let b = chunk;
    let dec = this.dec;
    if (!dec) {
      const { enc, bomLen } = sniff(b, this.oem);
      dec = iconv.getDecoder(enc);
      this.dec = dec;
      if (bomLen) b = b.subarray(bomLen);
    }
    return dec.write(b);
  }

  end(): string {
    return this.dec ? (this.dec.end() ?? '') : '';
  }
}
