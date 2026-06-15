'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Currency } from '@/lib/format';

const KEY = 'vision:currency';

export function useCurrency(): [Currency, (c: Currency) => void] {
  const [currency, setCurrencyState] = useState<Currency>('ITC');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && (localStorage.getItem(KEY) as Currency)) || 'ITC';
    setCurrencyState(stored);
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== 'undefined') localStorage.setItem(KEY, c);
  }, []);

  return [currency, setCurrency];
}
