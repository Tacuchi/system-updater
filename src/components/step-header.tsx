import React, { useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import { semantic, terminalTheme } from '../theme.js';
import { ASCII, g } from '../lib/glyphs.js';
import { t } from '../i18n/index.js';
import { useMachine } from '../hooks/use-app-machine.js';
import { getVersion } from '../lib/version.js';
import { getPlatform } from '../lib/platform.js';
import { bannerSnapshot, shownBanner, subscribeBanner, type BannerImage } from '../lib/banner.js';
import { placeholderRows } from '../lib/terminal-image.js';
import type { Phase } from '../state/types.js';
const steps: Partial<Record<Phase, number>> = { boot: 1, detecting: 1, scanning: 1, select: 2, confirm: 3, updating: 4 };
export function StepHeader() {
  const banner = shownBanner(useSyncExternalStore(subscribeBanner, bannerSnapshot));
  return banner ? <BrandBanner image={banner} /> : <LineHeader />;
}
const clip = (text: string, width: number) => text.length > width ? text.slice(0, Math.max(0, width - g.ellipsis.length)) + g.ellipsis : text;
/** The image, 3 rows tall and 2 columns in from the margin, beside three text lines. */
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
    <Box flexDirection="column" marginLeft={1} width={image.columns} flexShrink={0}>
      {placeholderRows(image.id, image.columns, image.rows).map((row, index) => <Text key={index}>{row}</Text>)}
    </Box>
    <Box flexDirection="column" marginLeft={2}>
      <Text><Text bold color={semantic.text}>{name}</Text><Text color={semantic.muted}>{clip(version, Math.max(0, textWidth - name.length))}</Text></Text>
      <Text color={semantic.muted}>{clip(platform, textWidth)}</Text>
      <Text color={semantic.muted}>{clip(step ? `${t('flow', 'step')} ${step}/4 ${g.separator} ${label}` : label, textWidth)}</Text>
    </Box>
  </Box>;
}
/** The one-line header: the fallback whenever the banner cannot be shown. */
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
