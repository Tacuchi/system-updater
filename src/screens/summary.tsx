import React from 'react';
import { Box, Text } from 'ink';
import { useMachine, summarizeRun } from '../hooks/use-app-machine.js';
import type { RunSummaryManager } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph } from '../components/status-glyph.js';
import { semantic } from '../theme.js';
import { getLogFilePath } from '../lib/logger.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerStatus } from '../state/types.js';

/** Show a version delta only for a single upgraded package with a known target. */
function versionDelta(m: RunSummaryManager): string {
  const ups = (m.packages ?? []).filter(p => p.outcome === 'upgraded' && p.toVersion);
  if (ups.length !== 1) return '';
  const p = ups[0]!;
  return p.fromVersion
    ? `${p.name} ${p.fromVersion} ${g.arrow} ${p.toVersion}`
    : `${p.name} ${g.arrow} ${p.toVersion}`;
}

/** One fixed-width row per manager: status · name · counts · version delta · duration. */
function ManagerRow({ m }: { m: RunSummaryManager }) {
  const dur = m.durationMs !== undefined ? `${(m.durationMs / 1000).toFixed(1)}s` : '';
  return (
    <Box>
      <Box width={2}>
        <StatusGlyph status={m.status as ManagerStatus} />
      </Box>
      <Box width={14}>
        <Text color={semantic.text} wrap="truncate-end">
          {managerName(m.id)}
        </Text>
      </Box>
      <Box width={9}>
        {m.upgraded > 0 ? (
          <Text color={semantic.success}>
            {g.done} {m.upgraded}
          </Text>
        ) : null}
        {m.failed > 0 ? (
          <Text color={semantic.error}>
            {' '}
            {g.failed} {m.failed}
          </Text>
        ) : null}
      </Box>
      <Box flexGrow={1}>
        <Text color={semantic.muted} wrap="truncate-end">
          {versionDelta(m)}
        </Text>
      </Box>
      <Box width={7} justifyContent="flex-end">
        <Text color={semantic.muted}>{dur}</Text>
      </Box>
    </Box>
  );
}

export function SummaryScreen() {
  const { state, rescan } = useMachine();

  useSafeInput((input) => {
    if (input === 'r' || input === 'R') rescan();
  });

  const summary = summarizeRun(state);
  const { upgraded, failed, skipped } = summary;
  const hasErrors = failed > 0;

  // Failure/manual/reboot detail lives on the entry results, not in summarizeRun.
  const failures: { manager: string; package?: string; message: string; kind?: string }[] = [];
  const manuals: { manager: string; command: string }[] = [];
  const reboots: { manager: string; state: string }[] = [];
  for (const id of state.run.queue) {
    const e = state.managers[id];
    if (!e) continue;
    if (e.status === 'skipped') {
      if (e.manualCommand) manuals.push({ manager: id, command: e.manualCommand });
      continue;
    }
    const r = e.result;
    if (r) {
      for (const f of r.failures) failures.push({ manager: id, package: f.package, message: f.message, kind: f.kind });
      if (r.reboot) reboots.push({ manager: id, state: r.reboot });
    }
  }

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={hasErrors ? semantic.error : semantic.success} bold>
          {hasErrors ? `${g.failed} ${t('ui', 'withErrors')}` : `${g.done} ${t('ui', 'allDone')}`}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={semantic.success}>{upgraded} {t('ui', 'upgraded')}</Text>
        <Text color={semantic.muted}>  ·  </Text>
        <Text color={hasErrors ? semantic.error : semantic.muted}>{failed} {t('ui', 'failed')}</Text>
        <Text color={semantic.muted}>  ·  </Text>
        <Text color={semantic.warning}>{skipped} {t('ui', 'skipped')}</Text>
      </Box>

      {summary.managers.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {summary.managers.map(m => (
            <ManagerRow key={m.id} m={m} />
          ))}
        </Box>
      )}

      {failures.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {failures.slice(0, 8).map((f, i) => (
            <Text key={i} color={semantic.error} wrap="truncate-end">
              {g.failed} {managerName(f.manager)}
              {f.package ? <Text color={semantic.text}> {f.package}</Text> : null}
              {f.kind ? <Text color={semantic.muted}> · {f.kind}</Text> : null}
            </Text>
          ))}
          {failures.some(f => f.kind === 'TIMEOUT') && (
            <Text color={semantic.warning}>
              {g.info} Un TIMEOUT suele indicar un paquete que pide interacción (ej. un cask que requiere cerrar la app
              o sudo). Actualízalo manualmente en una terminal.
            </Text>
          )}
        </Box>
      )}

      {manuals.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={semantic.warning}>{t('ui', 'manualNeeded')}</Text>
          {manuals.map((m, i) => (
            <Text key={i} color={semantic.muted}>
              {'  '}
              {managerName(m.manager)}: <Text color={semantic.text}>{m.command}</Text>
            </Text>
          ))}
        </Box>
      )}

      {reboots.length > 0 && (
        <Box marginBottom={1}>
          <Text color={semantic.warning}>
            {g.reboot} Reinicio pendiente: {reboots.map(r => `${managerName(r.manager)} (${r.state})`).join(', ')}
          </Text>
        </Box>
      )}

      {/* Log path is ALWAYS shown now (was hasErrors-only); muted on a clean run. */}
      <Text color={semantic.muted}>
        {t('ui', 'logAt')} {getLogFilePath() ?? '~/.tacuchi-updater/logs/'}
      </Text>
      <Box marginTop={1}>
        <Text color={semantic.muted}>{t('ui', 'summaryHint')}</Text>
      </Box>
    </Box>
  );
}
