import { useState, useEffect, useCallback, useRef } from 'react';
import { detectManagers } from '../managers/registry.js';
import type { DetectedManager } from '../managers/registry.js';
import type { OutdatedPackage } from '../managers/types.js';
import { isManagerEnabled } from '../lib/config.js';
import type { UserConfig } from '../lib/config.js';
import * as logger from '../lib/logger.js';

export interface ManagerState {
  manager: DetectedManager;
  outdated: OutdatedPackage[];
  scanning: boolean;
}

export function useManagers(config: UserConfig) {
  const [managers, setManagers] = useState<ManagerState[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const scan = useCallback(async () => {
    setDetecting(true);
    logger.log('Detectando gestores de paquetes...');

    try {
      const detected = await detectManagers();
      logger.log(`${detected.length} gestor(es) detectados`);

      const initial = detected.map(m => ({
        manager: m,
        outdated: [] as OutdatedPackage[],
        scanning: isManagerEnabled(configRef.current, m.manager.id),
      }));
      setManagers(initial);
      setDetecting(false);

      // Solo escanear managers habilitados
      await Promise.allSettled(
        detected.map(async (dm, idx) => {
          if (!isManagerEnabled(configRef.current, dm.manager.id)) {
            setManagers(prev => {
              const next = [...prev];
              if (next[idx]) next[idx] = { ...next[idx]!, scanning: false };
              return next;
            });
            return;
          }
          try {
            logger.debug(`Escaneando ${dm.manager.id}...`);
            const outdated = await dm.manager.listOutdated();
            logger.log(`${dm.manager.id}: ${outdated.length} paquetes desactualizados`);
            setManagers(prev => {
              const next = [...prev];
              if (next[idx]) {
                next[idx] = { ...next[idx]!, outdated, scanning: false };
              }
              return next;
            });
          } catch (err) {
            logger.error(`Error escaneando ${dm.manager.id}: ${String(err)}`);
            setManagers(prev => {
              const next = [...prev];
              if (next[idx]) {
                next[idx] = { ...next[idx]!, scanning: false };
              }
              return next;
            });
          }
        })
      );

      setLastScan(new Date());
    } catch (err) {
      logger.error(`Error en detección: ${String(err)}`);
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  return { managers, detecting, lastScan, rescan: scan };
}
