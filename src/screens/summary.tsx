import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { semantic } from '../theme.js';
import { getLogFilePath } from '../lib/logger.js';
import { t, managerName } from '../i18n/index.js';

export function SummaryScreen() {
  const { state, rescan } = useMachine();

  useInput((input) => {
    if (input === 'r' || input === 'R') rescan();
  });

  let upgraded = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { manager: string; package?: string; message: string; kind?: string }[] = [];
  const manuals: { manager: string; command: string }[] = [];

  for (const id of state.run.queue) {
    const e = state.managers[id];
    if (!e) continue;
    if (e.status === 'skipped') {
      skipped++;
      if (e.manualCommand) manuals.push({ manager: id, command: e.manualCommand });
      continue;
    }
    const r = e.result;
    if (r) {
      upgraded += r.upgraded;
      failed += r.failed;
      for (const f of r.failures) failures.push({ manager: id, package: f.package, message: f.message, kind: f.kind });
    }
  }

  const hasErrors = failed > 0;

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={hasErrors ? semantic.error : semantic.success} bold>
          {hasErrors ? `✗ ${t('ui', 'withErrors')}` : `✓ ${t('ui', 'allDone')}`}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={semantic.success}>{upgraded} {t('ui', 'upgraded')}</Text>
        <Text color={semantic.muted}>  ·  </Text>
        <Text color={hasErrors ? semantic.error : semantic.muted}>{failed} {t('ui', 'failed')}</Text>
        <Text color={semantic.muted}>  ·  </Text>
        <Text color={semantic.warning}>{skipped} {t('ui', 'skipped')}</Text>
      </Box>

      {failures.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {failures.slice(0, 8).map((f, i) => (
            <Text key={i} color={semantic.error} wrap="truncate-end">
              ✗ {managerName(f.manager)}
              {f.package ? <Text color={semantic.text}> {f.package}</Text> : null}
              {f.kind ? <Text color={semantic.muted}> · {f.kind}</Text> : null}
            </Text>
          ))}
          {failures.some(f => f.kind === 'TIMEOUT') && (
            <Text color={semantic.warning}>
              ⓘ Un TIMEOUT suele indicar un paquete que pide interacción (ej. un cask que requiere cerrar la app o
              sudo). Actualízalo manualmente en una terminal.
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

      {hasErrors && (
        <Text color={semantic.muted}>
          {t('ui', 'logAt')} {getLogFilePath() ?? '~/.tacuchi-updater/logs/'}
        </Text>
      )}
      <Box marginTop={1}>
        <Text color={semantic.muted}>{t('ui', 'summaryHint')}</Text>
      </Box>
    </Box>
  );
}
