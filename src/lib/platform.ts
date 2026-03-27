import os from 'os';

export type Platform = 'macos' | 'windows' | 'linux';

export function getPlatform(): Platform {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'win32': return 'windows';
    default: return 'linux';
  }
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export interface SystemInfo {
  platform: Platform;
  os: string;
  kernel: string;
  hostname: string;
  uptime: string;
  arch: string;
  totalMemory: string;
  freeMemory: string;
  loadAvg: string;
}

export function getSystemInfo(): SystemInfo {
  const platform = getPlatform();
  const uptimeSec = os.uptime();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const load = os.loadavg();

  const osName: Record<Platform, string> = {
    macos: `macOS ${os.release()}`,
    windows: `Windows ${os.release()}`,
    linux: `Linux ${os.release()}`,
  };

  return {
    platform,
    os: osName[platform],
    kernel: os.release(),
    hostname: os.hostname(),
    uptime: formatUptime(uptimeSec),
    arch: os.arch(),
    totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
    freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
    loadAvg: `${load[0]?.toFixed(2) ?? '0.00'}`,
  };
}
