'use client';

import { useEffect, useState } from 'react';
import { vision } from '@/lib/sdk-client';
import { api } from '@/lib/api';
import { useSse } from '@/lib/sse';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

export function useNetwork() {
  const [stats, setStats] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [supply, setSupply] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tipUpdated, setTipUpdated] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [statsResult, priceResult, supplyResult] = await Promise.allSettled([
        withTimeout(vision.getNetworkStats(), 8000),
        withTimeout(vision.getPrice(), 8000),
        // Supply may take longer if gettxoutsetinfo is uncached
        withTimeout(api.supply(), 65000),
      ]);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (priceResult.status === 'fulfilled') setPrice(priceResult.value);
      if (supplyResult.status === 'fulfilled') setSupply(supplyResult.value);
      setLoading(false);
    };
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  useSse((ev) => {
    if (ev.type === 'block') setTipUpdated((v) => v + 1);
    if (ev.type === 'snapshot' && ev.data?.price) setPrice(ev.data.price);
  });

  return { stats, price, supply, loading, tipUpdated };
}
