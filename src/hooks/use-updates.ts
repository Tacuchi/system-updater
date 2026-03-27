import { useState, useCallback } from 'react';
import type { PackageManager, ProgressEvent, UpgradeResult } from '../managers/types.js';
import * as logger from '../lib/logger.js';

export type UpdateStatus = 'idle' | 'running' | 'success' | 'error';

export interface UpdateProgress {
  managerId: string;
  status: UpdateStatus;
  percent: number;
  currentPackage?: string;
  logs: string[];
  manualCommand?: string;
  result?: UpgradeResult;
}

const LOG_FLUSH_INTERVAL = 150; // ms entre flushes de logs a la UI

export function useUpdates() {
  const [updates, setUpdates] = useState<Map<string, UpdateProgress>>(new Map());

  const startUpdate = useCallback(
    async (manager: PackageManager, packages?: string[], sudoMode?: boolean) => {
      const id = manager.id;

      setUpdates(prev => {
        const next = new Map(prev);
        next.set(id, {
          managerId: id,
          status: 'running',
          percent: 0,
          logs: [],
        });
        return next;
      });

      logger.log(`Iniciando actualización: ${id}`);

      try {
        const gen = manager.upgrade(packages, sudoMode);
        let result = await gen.next();

        // Buffer de logs para throttlear actualizaciones de estado
        let logBuffer: string[] = [];
        let lastPercent = 0;
        let lastPackage: string | undefined;
        let lastStatus: 'running' | 'error' = 'running';
        let lastFlush = Date.now();

        const flushToState = () => {
          const buffered = logBuffer;
          const pct = lastPercent;
          const pkg = lastPackage;
          const st = lastStatus;
          logBuffer = [];
          lastFlush = Date.now();

          setUpdates(prev => {
            const next = new Map(prev);
            const current = next.get(id);
            if (!current) return prev;
            next.set(id, {
              ...current,
              percent: pct || current.percent,
              currentPackage: pkg ?? current.currentPackage,
              logs: buffered.length > 0 ? [...current.logs, ...buffered] : current.logs,
              status: st,
            });
            return next;
          });
        };

        while (!result.done) {
          const event = result.value as ProgressEvent;

          if (event.message) {
            logBuffer.push(event.message);
            logger.debug(`[${id}] ${event.message}`);
          }
          if (event.percent !== undefined) lastPercent = event.percent;
          if (event.package) lastPackage = event.package;
          if (event.type === 'error') lastStatus = 'error';

          // Flush si pasó suficiente tiempo o es un evento importante
          const now = Date.now();
          const isImportant = event.type === 'start' || event.type === 'complete' || event.type === 'error';
          if (isImportant || now - lastFlush >= LOG_FLUSH_INTERVAL) {
            flushToState();
          }

          result = await gen.next();
        }

        // Flush final de logs pendientes
        if (logBuffer.length > 0) flushToState();

        const upgradeResult = result.value;
        setUpdates(prev => {
          const next = new Map(prev);
          const current = next.get(id);
          if (!current) return prev;
          next.set(id, {
            ...current,
            status: upgradeResult?.success ? 'success' : 'error',
            percent: 100,
            manualCommand: upgradeResult?.manualCommand,
            result: upgradeResult,
          });
          return next;
        });

        if (upgradeResult?.success) {
          logger.success(`${id}: ${upgradeResult.upgraded} paquete(s) actualizado(s)`);
        } else {
          logger.warn(`${id}: ${upgradeResult?.failed ?? 0} error(es)`);
          for (const e of upgradeResult?.errors ?? []) {
            logger.error(`[${id}] ${e}`);
          }
        }
      } catch (err) {
        const errMsg = String(err);
        logger.error(`Error actualizando ${id}: ${errMsg}`);
        setUpdates(prev => {
          const next = new Map(prev);
          const current = next.get(id);
          if (current) {
            next.set(id, {
              ...current,
              status: 'error',
              percent: 0,
              logs: [...current.logs, `[ERR] ${errMsg}`],
              result: { success: false, upgraded: 0, failed: 1, errors: [errMsg] },
            });
          }
          return next;
        });
      }
    },
    []
  );

  const startUninstall = useCallback(
    async (manager: PackageManager, packages: string[], sudoMode?: boolean) => {
      if (!manager.uninstall) return;
      const id = `${manager.id}:uninstall`;

      setUpdates(prev => {
        const next = new Map(prev);
        next.set(id, { managerId: id, status: 'running', percent: 0, logs: [] });
        return next;
      });

      logger.log(`Iniciando desinstalación: ${manager.id} [${packages.join(', ')}]`);

      try {
        const gen = manager.uninstall(packages, sudoMode);
        let result = await gen.next();
        let logBuffer: string[] = [];
        let lastFlush = Date.now();

        const flush = () => {
          const buffered = logBuffer;
          logBuffer = [];
          lastFlush = Date.now();
          setUpdates(prev => {
            const next = new Map(prev);
            const current = next.get(id);
            if (!current) return prev;
            next.set(id, { ...current, logs: [...current.logs, ...buffered] });
            return next;
          });
        };

        while (!result.done) {
          const event = result.value as ProgressEvent;
          if (event.message) {
            logBuffer.push(event.message);
            logger.debug(`[${id}] ${event.message}`);
          }
          if (Date.now() - lastFlush >= LOG_FLUSH_INTERVAL || event.type !== 'log') flush();
          result = await gen.next();
        }
        if (logBuffer.length > 0) flush();

        const uninstallResult = result.value;
        setUpdates(prev => {
          const next = new Map(prev);
          const current = next.get(id);
          if (!current) return prev;
          next.set(id, {
            ...current,
            status: uninstallResult?.success ? 'success' : 'error',
            percent: 100,
            result: uninstallResult,
          });
          return next;
        });

        if (uninstallResult?.success) {
          logger.success(`${manager.id}: ${packages.length} paquete(s) desinstalado(s)`);
        } else {
          logger.error(`${manager.id}: error al desinstalar`);
        }
      } catch (err) {
        logger.error(`Error desinstalando ${manager.id}: ${String(err)}`);
        setUpdates(prev => {
          const next = new Map(prev);
          const current = next.get(id);
          if (current) {
            next.set(id, {
              ...current,
              status: 'error',
              percent: 0,
              result: { success: false, upgraded: 0, failed: 1, errors: [String(err)] },
            });
          }
          return next;
        });
      }
    },
    []
  );

  const clearUpdate = useCallback((managerId: string) => {
    setUpdates(prev => {
      const next = new Map(prev);
      next.delete(managerId);
      return next;
    });
  }, []);

  return { updates, startUpdate, startUninstall, clearUpdate };
}
