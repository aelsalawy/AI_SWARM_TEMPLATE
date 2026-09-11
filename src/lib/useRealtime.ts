/**
 * useRealtime — P3-1 Real-time updates via Server-Sent Events (SSE).
 *
 * Provides a singleton EventSource connected to `/api/events` and exposes a
 * declarative subscription hook so components can react to live events from
 * the ALM event bus (task.*, bug.*, agent.*).
 *
 * Usage:
 *   useRealtime('task.updated', (event) => { ... });
 *     → fires for exact event type.
 *   useRealtime('task.*', (event) => { ... });
 *     → fires for any event matching the wildcard.
 */

import { useEffect, useRef } from 'react';

export interface RealtimeEvent {
  type: string;
  payload: any;
  timestamp: string;
  source?: string;
  id?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

type Listener = (event: RealtimeEvent) => void;

interface Registration {
  pattern: RegExp;
  listener: Listener;
}

// Singleton connection state (module scope survives across hook instances).
let eventSource: EventSource | null = null;
let registrations: Registration[] = [];
let connectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function startConnection() {
  if (eventSource || typeof window === 'undefined') return;
  // Don't attempt connection when unauthenticated (SSE is unauthenticated,
  // but we avoid opening sockets before the app is even logged in).
  if (!localStorage.getItem('accessToken')) return;

  eventSource = new EventSource(`${API_BASE}/events`);

  eventSource.addEventListener('event', (raw) => {
    try {
      const data = JSON.parse((raw as MessageEvent).data) as RealtimeEvent;
      registrations.forEach((reg) => {
        if (reg.pattern.test(data.type)) reg.listener(data);
      });
    } catch (err) {
      console.error('[useRealtime] Failed to parse SSE event:', err);
    }
  });

  eventSource.addEventListener('connected', () => {
    connectAttempts = 0;
  });

  eventSource.onopen = () => {
    connectAttempts = 0;
  };

  eventSource.onerror = () => {
    // Browser auto-reconnects; guard against tight-loop reconnect storms.
    handleDisconnect();
  };
}

function handleDisconnect() {
  try { eventSource?.close(); } catch (_) {}
  eventSource = null;

  // Exponential-ish backoff capped at 30s.
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(1000 * Math.pow(2, Math.min(connectAttempts, 5)), 30000);
  connectAttempts += 1;
  reconnectTimer = setTimeout(startConnection, delay);
}

function stopConnection() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (eventSource) {
    try { eventSource.close(); } catch (_) {}
    eventSource = null;
  }
}

// Convert a pattern like 'task.*' into a RegExp.
function patternToRegExp(pattern: string): RegExp {
  if (pattern === '*') return /^.*$/;
  return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : `\\${c}`))}$`);
}

/**
 * Subscribe to realtime events. Returns an unsubscribe function.
 */
export function subscribeRealtime(pattern: string, listener: Listener): () => void {
  const reg: Registration = { pattern: patternToRegExp(pattern), listener };
  registrations.push(reg);
  startConnection();
  return () => {
    registrations = registrations.filter((r) => r !== reg);
    if (registrations.length === 0) stopConnection();
  };
}

/**
 * React hook — subscribes to realtime events matching `pattern`.
 */
export function useRealtime(pattern: string, listener: Listener): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    if (!listenerRef.current) return;
    return subscribeRealtime(pattern, (event) => listenerRef.current!(event));
  }, [pattern]);
}

export default useRealtime;
