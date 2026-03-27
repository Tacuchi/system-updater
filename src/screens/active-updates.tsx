import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../app.js';
import { ProgressGauge } from '../components/progress-gauge.js';
import { StatusPill } from '../components/status-pill.js';
import { GhostBox } from '../components/ghost-box.js';
import { colors, box } from '../theme.js';
import { t } from '../i18n/index.js';
import type { UpdateProgress } from '../hooks/use-updates.js';

function StatusIndicator({ status }: { status: string }) {
  if (status === 'running') return <StatusPill variant="active">ACTIVO</StatusPill>;
  if (status === 'success') return <StatusPill variant="success">OK</StatusPill>;
  if (status === 'error') return <StatusPill variant="error">ERR</StatusPill>;
  return <StatusPill variant="muted">PENDIENTE</StatusPill>;
}

function ResultDetail({ upd }: { upd: UpdateProgress }) {
  const a = t('activeUpdates');
  if (!upd.result) return null;
  const { success, upgraded, failed, errors } = upd.result;

  return (
    <Box flexDirection="column" paddingLeft={1} marginTop={0}>
      <Box gap={3}>
        {upgraded > 0 && (
          <Text color={colors.tertiary}>
            {box.check} {upgraded} {a.upgraded}
          </Text>
        )}
        {failed > 0 && (
          <Text color={colors.error}>
            {box.cross} {failed} {a.failed}
          </Text>
        )}
        {success && failed === 0 && upgraded === 0 && (
          <Text color={colors.tertiary}>{box.check} {a.noChanges}</Text>
        )}
      </Box>
      {errors.length > 0 && (
        <Box flexDirection="column" paddingLeft={1}>
          {errors.slice(0, 5).map((err, i) => (
            <Text key={`err-${i}`} color={colors.error} dimColor>
              {box.bullet} {err.slice(0, 70)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ActiveUpdates() {
  const { updates, rescan, setScreen } = useApp();
  const a = t('activeUpdates');
  const [showDetail, setShowDetail] = useState<string | null>(null);

  const entries = Array.from(updates.entries());
  const activeCount = entries.filter(([, u]) => u.status === 'running').length;
  const successCount = entries.filter(([, u]) => u.status === 'success').length;
  const errorCount = entries.filter(([, u]) => u.status === 'error').length;
  const allDone = entries.length > 0 && activeCount === 0;

  const allLogs = entries.flatMap(([, u]) => u.logs).slice(-20);

  useInput((input, key) => {
    if (input === 'r' || input === 'R') rescan();
    if (input === 'd' || input === 'D') {
      if (showDetail) {
        setShowDetail(null);
      } else {
        const first = entries[0];
        if (first) setShowDetail(first[0]);
      }
    }
    if (key.escape) setScreen('dashboard');
  });

  if (entries.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={2} gap={1} alignItems="center" justifyContent="center" flexGrow={1}>
        <Text color={colors.onSurfaceVariant}>{a.noActive}</Text>
        <Text color={colors.outlineVariant} dimColor>{a.goToPackages}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color={colors.onSurface}>{a.title}</Text>
        <Box gap={2}>
          {allDone && (
            <Text color={colors.tertiary} bold>{a.allDone}</Text>
          )}
          {!allDone && (
            <Text color={colors.tertiary}>{a.syncing}</Text>
          )}
        </Box>
      </Box>

      <Box flexDirection="row" gap={2} flexGrow={1}>
        <Box flexDirection="column" gap={1} width="55%">
          {entries.map(([id, upd]) => (
            <Box key={id} flexDirection="column" gap={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={upd.status === 'error' ? colors.error : colors.onSurface} bold>
                  {id}
                </Text>
                <StatusIndicator status={upd.status} />
              </Box>
              <ProgressGauge
                value={upd.percent}
                width={30}
                color={upd.status === 'error' ? colors.error : upd.status === 'success' ? colors.tertiary : colors.primary}
              />
              {upd.status === 'running' && upd.currentPackage && (
                <Text color={colors.onSurfaceVariant} dimColor>{upd.currentPackage}</Text>
              )}
              {upd.manualCommand && (
                <Text color={colors.secondary}>
                  {t('packageSync', 'manualCmd')} {upd.manualCommand}
                </Text>
              )}
              {(upd.status === 'success' || upd.status === 'error') && (
                <ResultDetail upd={upd} />
              )}
            </Box>
          ))}

          {allDone && (
            <Box marginTop={1}>
              <Text color={colors.primary} dimColor>
                [R] {a.rescanHint}
              </Text>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          <GhostBox title={showDetail ? `LOG_${showDetail.toUpperCase()}` : `${a.stdout}_${Date.now().toString(16).toUpperCase().slice(-4)}`}>
            <Box flexDirection="column">
              {(showDetail
                ? (updates.get(showDetail)?.logs ?? []).slice(-18)
                : allLogs.slice(-18)
              ).map((line, i) => (
                <Text
                  key={`log-${i}-${line.slice(0, 20)}`}
                  color={
                    line.includes('[ERR]') ? colors.error
                    : line.includes('[OK]') ? colors.tertiary
                    : line.startsWith('==>') ? colors.tertiary
                    : line.startsWith('DEBUG') ? colors.onSurfaceVariant
                    : colors.onSurface
                  }
                  dimColor={line.startsWith('DEBUG')}
                >
                  {line.slice(0, 70)}
                </Text>
              ))}
            </Box>
          </GhostBox>
        </Box>
      </Box>

      <Box flexDirection="row" gap={4} marginTop={1} justifyContent="center">
        {[
          { label: a.active, value: activeCount, color: colors.primary },
          { label: a.success, value: successCount, color: colors.tertiary },
          { label: a.errors, value: errorCount, color: colors.error },
        ].map(({ label, value, color }) => (
          <Box key={label} flexDirection="column" alignItems="center">
            <Text color={colors.onSurfaceVariant} dimColor>{label}</Text>
            <Text color={color} bold>
              {String(value).padStart(2, '0')}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
