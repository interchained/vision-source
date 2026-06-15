'use client';

import { useEffect, useRef, useState } from 'react';

// Always '' — this module is 'use client' so it only ever runs in the browser.
// Relative URL ensures requests stay on the same HTTPS origin (no mixed content).
const SSE_BASE = '';

export type SseEvent = { type: string; data: any };

/** Subscribe to the backend SSE firehose. */
export function useSse(onEvent?: (event: SseEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SseEvent | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const url = `${SSE_BASE}/api/sse`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handle = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const ev = { type, data };
        setLastEvent(ev);
        handlerRef.current?.(ev);
      } catch (_e) {
        /* ignore */
      }
    };
    ['snapshot', 'block', 'mempool', 'tx', 'token', 'ping'].forEach((t) => {
      es.addEventListener(t, handle(t));
    });

    return () => es.close();
  }, []);

  return { connected, lastEvent };
}
