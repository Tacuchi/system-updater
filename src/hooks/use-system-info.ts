import { useState, useEffect } from 'react';
import { getSystemInfo } from '../lib/platform.js';
import type { SystemInfo } from '../lib/platform.js';

export function useSystemInfo(refreshIntervalMs = 10_000): SystemInfo {
  const [info, setInfo] = useState<SystemInfo>(getSystemInfo);

  useEffect(() => {
    const id = setInterval(() => {
      setInfo(getSystemInfo());
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [refreshIntervalMs]);

  return info;
}
