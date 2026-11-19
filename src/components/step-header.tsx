import React, { useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import { semantic, terminalTheme } from '../theme.js';
import { ASCII, g } from '../lib/glyphs.js';
import { t } from '../i18n/index.js';
import { useMachine } from '../hooks/use-app-machine.js';
import { getVersion } from '../lib/version.js';
import { getPlatform } from '../lib/platform.js';
import { bannerSnapshot, shownBanner, subscribeBanner, type BannerImage } from '../lib/banner.js';
import { IMAGE_COLUMN, placeholderRows } from '../lib/terminal-image.js';
import { markSegments } from '../lib/brand-mark.js';
import type { Phase } from '../state/types.js';
const steps: Partial<Record<Phase, number>> = { boot: 1, detecting: 1, scanning: 1, select: 2, confirm: 3, updating: 4 };
export function StepHeader() {
  const banner = shownBanner(useSyncExternalStore(subscribeBanner, bannerSnapshot));
  return banner ? <BrandBanner image={banner} /> : <LineHeader />;
}
const clip = (text: string, width: number) => text.length > width ? text.slice(0, Math.max(0, width - g.ellipsis.length)) + g.ellipsis : text;
/**
 * The mark, 6 x 3 cells and 2 columns in from the margin (IMAGE_COLUMN),
 * beside three text lines. Placeholder cells and the text forms draw it here;
 * the cursor and sixel tiers draw it over the same cells, left blank here,
 * after each frame.
 */
function BrandBanner({ image }: { image: BannerImage }) {
  const { state, selfUpdate } = useMachine();
  const textWidth = Math.min(process.stdout.columns ?? 100, 100) - 2 - 1 - image.columns - 2;
  const step = steps[state.phase];
  const label = t('flow', state.phase === 'boot' ? 'detecting' : state.phase);
  const version = ` ${getVersion()}${selfUpdate ? ` ${g.arrow} ${selfUpdate.version}` : ''}`;
  const count = state.order.length;
  const detecting = count === 0 && (state.phase === 'boot' || state.phase === 'detecting');
  const managers = !detecting ? `${count} ${t('banner', count === 1 ? 'managerOne' : 'managerMany')}` : state.error ? '' : t('banner', 'searching');
  const platform = t('banner', getPlatform()) + (managers ? ` ${g.separator} ${managers}` : '');
  const name = 'tacuchi updater';
  return <Box marginBottom={1}>
    <Box flexDirection="column" marginLeft={IMAGE_COLUMN - 1} width={image.columns} flexShrink={0}>
      <MarkCells image={image} />
    </Box>
    <Box flexDirection="column" marginLeft={2}>
      <Text><Text bold color={semantic.text}>{name}</Text><Text color={semantic.muted}>{clip(version, Math.max(0, textWidth - name.length))}</Text></Text>
      <Text color={semantic.muted}>{clip(platform, textWidth)}</Text>
      <Text color={semantic.muted}>{clip(step ? `${t('flow', 'step')} ${step}/4 ${g.separator} ${label}` : label, textWidth)}</Text>
    </Box>
  </Box>;
}
/** The mark's cells: block cells in the text token, the lime piece in the accent token, no colour under NO_COLOR. */
function MarkCells({ image }: { image: BannerImage }) {
  if (image.tier === 'blocks' || image.tier === 'ascii') {
    const color = process.env['NO_COLOR'] === undefined;
    return <>{markSegments(image.tier).map((row, index) => <Text key={index}>
      {row.map((segment, at) => <Text key={at} color={color ? (segment.lime ? semantic.accentFill : semantic.text) : undefined}>{segment.text}</Text>)}
    </Text>)}</>;
  }
  const rows = image.tier === 'placeholders' ? placeholderRows(image.id, image.columns, image.rows) : Array.from({ length: image.rows }, () => ' '.repeat(image.columns));
  return <>{rows.map((row, index) => <Text key={index}>{row}</Text>)}</>;
}
/** The one-line header: the fallback whenever the mark does not fit or stdout is not a terminal. */
function LineHeader() {
  const { state, selfUpdate } = useMachine();
  const width = Math.min(process.stdout.columns ?? 100, 100) - 2;
  const key = state.phase === 'boot' ? 'detecting' : state.phase;
  const label = t('flow', key);
  const step = steps[state.phase];
  let product = ` updater ${getVersion()}${selfUpdate ? ` ${g.arrow} ${selfUpdate.version}` : ''}`;
  let right = step ? `${t('flow', 'step')} ${step}/4 ${g.separator} ${label}` : label;
  if (8 + product.length + right.length + 1 > width) product = product.replace(' updater', '');
  if (8 + product.length + right.length + 1 > width && step) right = `${step}/4 ${g.separator} ${label}`;
  const available = width - 8 - product.length - 1;
  if (right.length > available) right = right.slice(0, Math.max(0, available - g.ellipsis.length)) + g.ellipsis;
  const gap = ' '.repeat(Math.max(1, width - 8 - product.length - right.length));
  const plainLogo = ASCII || process.env['NO_COLOR'] !== undefined;
  return <Box marginBottom={1}>
    <Text bold color={semantic.text}>tacuchi</Text>
    {plainLogo ? <Text>_</Text> : <Text color={terminalTheme === 'light' ? semantic.text : semantic.logoFill} backgroundColor={terminalTheme === 'light' ? semantic.logoFill : undefined}>{g.logo}</Text>}
    <Text color={semantic.muted}>{product}{gap}{right}</Text>
  </Box>;
}
