/**
 * Whether the header is the image banner, shared by the header, the screens
 * that size their lists by the terminal height, and every exit route.
 *
 * The entry point configures it once, after the terminal answered the kitty
 * query and the image was transmitted. Retiring it before Ink's last frame
 * leaves the one-line header in the scrollback, so no placeholder cell
 * outlives the image that the exit handler deletes.
 */
import { ASCII } from './glyphs.js';
import { BANNER_EXTRA_ROWS, bannerBlocker } from './terminal-image.js';

export interface BannerImage { id: number; columns: number; rows: number }

let image: BannerImage | null = null;
let retired = false;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function configureBanner(next: BannerImage | null): void {
  image = next;
  retired = false;
  emit();
}

/** Switch to the line header for good. True when a banner was configured and is now retired. */
export function retireBanner(): boolean {
  if (!image || retired) return false;
  retired = true;
  emit();
  return true;
}

export function subscribeBanner(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function bannerSnapshot(): BannerImage | null {
  return retired ? null : image;
}

/** The banner to draw now, or null for the line header: it is re-checked on every render, resize included. */
export function shownBanner(snapshot = bannerSnapshot(), stdout: { columns?: number; rows?: number } = process.stdout, env = process.env, ascii = ASCII): BannerImage | null {
  if (!snapshot) return null;
  const blocker = bannerBlocker({ env, stdoutTTY: true, ascii, columns: Math.min(stdout.columns ?? 100, 100), rows: stdout.rows ?? 24 });
  return blocker ? null : snapshot;
}

/** Rows a scrolling list gives up so the screen still fits under the banner. */
export function headerExtraRows(): number {
  return shownBanner() ? BANNER_EXTRA_ROWS : 0;
}
