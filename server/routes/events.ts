import { Router, Request, Response } from 'express';
import { eventBus } from '../event-bus';

/**
 * Server-Sent Events (SSE) endpoint — P3-1 Real-time updates.
 *
 * Subscribes a browser client to the in-process eventBus and streams every
 * emitted event (task.*, bug.*, agent.*) down the HTTP connection.
 *
 * Client usage:
 *   const es = new EventSource('/api/events');
 *   es.addEventListener('event', (e) => { const data = JSON.parse(e.data); ... });
 *   es.addEventListener('heartbeat', () => {});
 */
const router = Router();

const HEARTBEAT_INTERVAL_MS = 25000;

// Concrete event types emitted by the event bus (see server/event-bus.ts).
const EVENT_TYPES = [
  'task.created',
  'task.updated',
  'task.claimed',
  'task.completed',
  'task.failed',
  'bug.created',
  'bug.resolved',
  'agent.online',
  'agent.offline',
  'agent.busy',
  'agent.idle',
] as const;

// Track active EventSource clients so we can count them in diagnostics.
const activeClients = new Set<Response>();

export function getActiveStreamCount(): number {
  return activeClients.size;
}

router.get('/', (req: Request, res: Response) => {
  // SSE headers — essential for EventSource to stay open (no buffering).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx-friendly
  res.flushHeaders();

  // Initial event so the client knows the stream is live.
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

  activeClients.add(res);

  // Subscribe to every event bus event type. eventBus emits on the literal
  // event type string (see server/event-bus.ts emitEvent).
  const handleEvent = (event: any) => {
    try {
      const payload = JSON.stringify({
        type: event?.type,
        payload: event?.payload,
        timestamp: event?.timestamp?.toDate ? event.timestamp.toDate().toISOString() : new Date().toISOString(),
        source: event?.source,
        id: event?.id,
      });
      res.write(`event: event\ndata: ${payload}\n\n`);
    } catch (err) {
      console.error('[Events] Failed to serialize event:', err);
    }
  };

  // Attach one listener per concrete event type. The event bus emits on the
  // literal type string only (never on a wildcard channel), so we subscribe
  // to each concrete type to capture every event.
  const unsubscribers = EVENT_TYPES.map((type) =>
    eventBus.onEvent(type, handleEvent as any)
  );

  // Heartbeat to keep proxies/load-balancers from closing idle connections.
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch (_err) {
      // Client gone — cleanup below will fire via close handler.
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Cleanup on disconnect.
  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribers.forEach((unsub) => unsub());
    activeClients.delete(res);
    res.end();
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
});

export default router;
