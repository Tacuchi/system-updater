import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useScreenKeys, KeyHints } from './keys.js';
import { StatusGlyph, RunningGlyph, statusColor } from '../components/status-glyph.js';
import { semantic } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerEntry } from '../state/types.js';

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - g.ellipsis.length)) + g.ellipsis : s;
}

/** Formats a duration into the narrowest thing that is still unambiguous. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Tick elapsed time independently of manager output. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatElapsed(now - startedAt)}</>;
}

/** ONE line per manager — constant height across running→done so the frame never
 * changes size (which is what made Ink stack frames). The live "action" is the
 * latest output line, driven by real progress events (no spinner timer). */
function Row({ e, width }: { e: ManagerEntry; width: number }) {
  let detail = '';
  if (e.status === 'running') detail = '';
  else if (e.status === 'skipped') detail = e.manualCommand ?? 'manual';
  else if (e.status === 'failed') detail = e.result?.failures[0]?.message ?? '';
  else if (e.status === 'unknown') detail = e.result?.failures[0]?.message ?? t('ui', 'undetermined');

  return (
    <Box>
      <Box width={2}>
        {e.status === 'running' ? <RunningGlyph /> : <StatusGlyph status={e.status} />}
      </Box>
      <Box width={16}>
        <Text color={semantic.text} bold={e.status === 'running'}>
          {clip(managerName(e.id), 15)}
        </Text>
      </Box>
      <Box width={13}>
        <Text color={statusColor(e.status)}>{t('status', e.status)}</Text>
      </Box>
      <Text color={semantic.muted}>
        {e.status === 'running' ? (
          e.percent > 0 ? (
            `${e.percent}%`
          ) : e.startedAt !== undefined && e.startedAt > 0 ? (
            <Elapsed startedAt={e.startedAt} />
          ) : (
            ''
          )
        ) : (
          clip(detail, Math.max(0, width - 33))
        )}
      </Text>
      {e.status === 'running' && <Text color={semantic.muted}> {e.percent > 0 && e.startedAt ? <Elapsed startedAt={e.startedAt} /> : ''} {clip(e.currentPackage ?? '', Math.max(0, width - 45))}</Text>}
    </Box>
  );
}

export function UpdateScreen() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const { state, cancelRun, quitApp } = useMachine();

  const [asking, setAsking] = useState(false);
  const commands = useScreenKeys(asking ? {
    confirmCancel: () => { setAsking(false); cancelRun(); }, continueRun: () => setAsking(false), ctrlC: quitApp,
  } : { cancel: () => setAsking(true), quit: () => setAsking(true), ctrlC: quitApp });
  const activeNames = state.run.queue.filter(id => ['running', 'queued'].includes(state.managers[id]?.status ?? '')).map(managerName);

  const total = state.run.queue.length;
  const packagesDone = state.run.queue.reduce((sum, id) => { const result = state.managers[id]?.result; return sum + (result?.upgraded ?? 0) + (result?.failed ?? 0) + (result?.skipped ?? 0); }, 0);
  const canPrompt = state.run.queue.some(id => {
    const entry = state.managers[id];
    if (entry?.requiresAdmin && !state.sudoMode) return false;
    return entry?.requiresAdmin || (process.platform !== 'win32' && ['brew', 'gem', 'pip', 'pipx'].includes(id));
  });
  const finished =
    state.run.doneCount + state.run.failedCount + state.run.skippedCount + state.run.unknownCount;
  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={semantic.text}>{finished}/{total} {g.separator} {packagesDone} {t('ui', 'of')} {state.selection.size} {t('ui', state.selection.size === 1 ? 'packageOne' : 'packageMany')} {g.separator} {formatElapsed(now - (state.run.startedAt ?? now))}</Text>
      </Box>

      {state.run.queue.map(id => {
        const e = state.managers[id];
        return e ? <Row key={id} e={e} width={width} /> : null;
      })}

      <Box marginTop={1} flexDirection="column">
        <Box height={3} flexDirection="column">
          {asking && <Box height={2}><Text color={semantic.warning} wrap="truncate-end">{t('ui', 'cancelQuestion')} {activeNames.join(', ')}</Text></Box>}
          <KeyHints commands={commands} />
        </Box>
        {canPrompt && <Text color={semantic.muted}>{t('ui', 'passwordNote')}</Text>}
      </Box>
    </Box>
  );
}
