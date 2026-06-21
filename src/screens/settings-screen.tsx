import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { isManagerEnabled } from '../lib/config.js';
import { t, managerName } from '../i18n/index.js';

export function SettingsScreen() {
  const { state, toggleEnabled, setLang, closeSettings } = useMachine();
  const ids = state.order;
  const [cursor, setCursor] = useState(0);
  const clamped = Math.min(cursor, Math.max(0, ids.length - 1));

  useSafeInput((input, key) => {
    if (key.escape) closeSettings();
    else if (key.downArrow || input === 'j') setCursor(c => Math.min(ids.length - 1, c + 1));
    else if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1));
    else if (input === ' ') {
      const id = ids[clamped];
      if (id) toggleEnabled(id);
    } else if (input === 'l' || input === 'L') {
      setLang(state.config.language === 'es' ? 'en' : 'es');
    }
  });

  return (
    <Box flexDirection="column">
      <StepHeader phase="settings" />
      <Box marginBottom={1}>
        <Text color={semantic.text}>Idioma / Language: </Text>
        <Text color={semantic.action} bold>
          {state.config.language.toUpperCase()}
        </Text>
        <Text color={semantic.muted}> (L)</Text>
      </Box>
      {ids.map((id, i) => {
        const enabled = isManagerEnabled(state.config, id);
        const isCursor = i === clamped;
        return (
          <Box key={id}>
            <Text color={isCursor ? semantic.action : colors.outline}>{isCursor ? `${g.cursor} ` : '  '}</Text>
            <Text color={enabled ? semantic.success : colors.outline}>{enabled ? '[on ]' : '[off]'} </Text>
            <Text color={enabled ? semantic.text : semantic.muted}>{managerName(id)}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={semantic.muted}>Espacio activar/desactivar · L idioma · Esc volver</Text>
      </Box>
    </Box>
  );
}
