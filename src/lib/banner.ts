/**
 * Whether the header shows the mark (an image or its text form), shared by the header, the screens
 * that size their lists by the terminal height, and every exit route.
 *
 * The entry point configures it once, after the terminal answered and the
 * image, if any, was sent. Retiring it before Ink's last frame leaves the
 * one-line header in the scrollback, so no placeholder cell and no reserved gap
 * outlives the image that the exit handler deletes.
 */
import { BANNER_EXTRA_ROWS, MARK_COLUMNS, MARK_ROWS, bannerBlocker, type ImageTier, type TextTier } from './terminal-image.js';

/**
 * The cells the header gives the mark. The placeholder tier and the text forms
 * draw it as text; the cursor and sixel tiers draw over blank cells. `id` is
 * the kitty image id, 0 where there is none.
 */
export interface BannerImage { id: number; columns: number; rows: number; tier: ImageTier | TextTier }

/** The mark as text: nothing to send before Ink starts or to delete on exit. */
export function textBanner(tier: TextTier): BannerImage {
  return { id: 0, columns: MARK_COLUMNS, rows: MARK_ROWS, tier };
}

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

/**
 * The mark to draw now, or null for the line header: the size is re-checked on
 * every render, resize included. The form itself was chosen once at start.
 */
export function shownBanner(snapshot = bannerSnapshot(), stdout: { columns?: number; rows?: number } = process.stdout): BannerImage | null {
  if (!snapshot) return null;
  const blocker = bannerBlocker({ stdoutTTY: true, columns: Math.min(stdout.columns ?? 100, 100), rows: stdout.rows ?? 24 });
  return blocker ? null : snapshot;
}

/** Rows a scrolling list gives up so the screen still fits under the banner. */
export function headerExtraRows(): number {
  return shownBanner() ? BANNER_EXTRA_ROWS : 0;
}
