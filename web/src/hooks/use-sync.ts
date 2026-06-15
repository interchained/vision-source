'use client';

import { useEffect, useState } from 'react';
import { syncBus } from '@/lib/api';

export function useSyncState(): boolean {
  const [syncing, setSyncing] = useState<boolean>(() => syncBus.current);
  useEffect(() => syncBus.subscribe(setSyncing), []);
  return syncing;
}
