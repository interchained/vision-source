'use client';

/**
 * useSDKEvents — a React hook that wraps the SDK's EventSource subscription.
 *
 * This is the SDK-native alternative to the hand-rolled useSse hook.
 * Use this for new components so the SDK's subscribe() is exercised.
 */
import { useEffect, useRef, useState } from 'react';
import { vision } from '@/lib/sdk-client';
import type { VisionEvent, EventType } from '@/lib/sdk-client';

export function useSDKEvents(
  event: EventType | 'all',
  handler?: (e: VisionEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<VisionEvent | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = vision.subscribe(event, (e) => {
        setConnected(true);
        setLastEvent(e);
        handlerRef.current?.(e);
      });
    } catch {
      // EventSource not available (SSR) — ignore
    }
    return () => unsub?.();
  }, [event]);

  return { connected, lastEvent };
}
