import { t } from '../i18n/index.js';
import { g } from './glyphs.js';

const labels = {
  upgraded: ['upgradedOne', 'upgraded'],
  failed: ['failedOne', 'failed'],
  manual: ['manualShort', 'manualMany'],
  unknown: ['undeterminedShort', 'undeterminedShort'],
} as const;

export function countText(count: number, kind: keyof typeof labels): string {
  return `${count} ${t('ui', labels[kind][count === 1 ? 0 : 1])}`;
}

export function selectionText(marked: number, total: number): string {
  return `${marked} ${t('ui', 'of')} ${total} ${t('ui', marked === 1 ? 'selectedOne' : 'selected')}`;
}

export function summaryText(counts: { upgraded: number; failed: number; skipped: number; unknown: number }): string {
  const parts = [countText(counts.upgraded, 'upgraded')];
  if (counts.failed > 0) parts.push(countText(counts.failed, 'failed'));
  if (counts.skipped > 0) parts.push(countText(counts.skipped, 'manual'));
  if (counts.unknown > 0) parts.push(countText(counts.unknown, 'unknown'));
  return parts.join(` ${g.separator} `);
}
