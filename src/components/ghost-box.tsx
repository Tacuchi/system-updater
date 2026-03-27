import React from 'react';
import { Box, Text } from 'ink';
import { colors, box } from '../theme.js';

interface GhostBoxProps {
  title?: string;
  children: React.ReactNode;
  width?: number | string;
  dimBorder?: boolean;
}

export function GhostBox({ title, children, width, dimBorder = true }: GhostBoxProps) {
  const borderColor = dimBorder ? colors.outlineVariant : colors.outline;

  return (
    <Box flexDirection="column" width={width}>
      {/* Borde superior */}
      <Box>
        <Text color={borderColor} dimColor={dimBorder}>
          {box.topLeft}
          {title ? ` ${title} ` : ''}
          {box.horizontal}
        </Text>
      </Box>
      {/* Contenido */}
      <Box flexDirection="column" paddingLeft={1}>
        {children}
      </Box>
    </Box>
  );
}
