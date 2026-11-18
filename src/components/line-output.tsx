import { useEffect, useRef } from 'react';
import { useMachine, summarizeRun } from '../hooks/use-app-machine.js';
import { managerName, t } from '../i18n/index.js';
import { countText, summaryText } from '../lib/display-counts.js';
export function LineOutput({ write }: { write: (line: string) => void }) {
  const { state, selfUpdate } = useMachine();
  const emitted = useRef(new Set<string>());
  useEffect(() => {
    const once = (key: string, text: string) => {
      if (emitted.current.has(key)) return;
      emitted.current.add(key);
      write(text + '\n');
    };
    if (state.error) once('error', `${t('ui', 'detectionFailed')} ${state.error}`);
    for (const id of state.run.queue) {
      const entry = state.managers[id];
      if (!entry) continue;
      const result = entry.result;
      once(`${id}:${entry.status}`, `${managerName(id)}: ${t('status', entry.status)}${result ? ` ${countText(result.upgraded, 'upgraded')}, ${countText(result.failed, 'failed')}` : ''}${entry.manualCommand ? ` ${entry.manualCommand}` : ''}`);
    }
    if (state.phase === 'summary' || (state.phase === 'select' && state.order.every(id => state.managers[id]?.outdated.length === 0))) {
      const result = summarizeRun(state);
      once('summary', `${t('flow', 'summary')}: ${summaryText(result)}`);
      if (selfUpdate) once('self-update', selfUpdate.howTo);
    }
  }, [state, selfUpdate, write]);
  return null;
}
