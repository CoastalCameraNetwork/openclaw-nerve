/**
 * Server-Sent Events (SSE) endpoint for real-time push updates.
 *
 * GET  /api/events      — SSE stream for real-time updates
 * POST /api/events/test — Debug: broadcast a test event
 *
 * Event types:
 * - memory.changed  — Memory file was modified
 * - tokens.updated  — Token usage changed
 * - status.changed  — Gateway status changed
 * - ping            — Keep-alive (every 30s)
 * - agent.signal    — Structured agent signal (status, blocker, handoff)
 * - task.blocked    — Task blocked, needs input
 * - task.start      — Task execution started
 * - task.end        — Task execution completed
 * - agent.start     — Agent session started
 * - agent.end       — Agent session completed
 * - agent.turn.start — Agent turn started
 * - agent.turn.end  — Agent turn completed
 * - tool.execution.start — Tool execution started
 * - tool.execution.end   — Tool execution completed
 * - task.steering   — Steering message added
 * - task.followup   — Follow-up message added
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { OrchestratorEvent } from '../lib/orchestrator-events.js';

const app = new Hono();

// ── Broadcaster (singleton) ──────────────────────────────────────────

export interface SSEEvent {
  event: string;
  data: unknown;
  ts: number;
}

/** Extended SSE payload for typed orchestrator events */
export interface TypedSSEEvent<T extends string = string> {
  event: T;
  data: T extends OrchestratorEvent['type'] ? Extract<OrchestratorEvent, { type: T }> : unknown;
  ts: number;
}

class SSEBroadcaster extends EventEmitter {
  private static instance: SSEBroadcaster;

  private constructor() {
    super();
    this.setMaxListeners(100); // one per connected client
  }

  static getInstance(): SSEBroadcaster {
    if (!SSEBroadcaster.instance) {
      SSEBroadcaster.instance = new SSEBroadcaster();
    }
    return SSEBroadcaster.instance;
  }

  broadcast(event: string, data: unknown = {}): void {
    this.emit('message', { event, data, ts: Date.now() } satisfies SSEEvent);
  }

  /** Broadcast a typed orchestrator event */
  broadcastTyped<T extends OrchestratorEvent['type']>(event: T, data: Extract<OrchestratorEvent, { type: T }>): void {
    this.emit('message', { event, data, ts: Date.now() } as SSEEvent);
  }
}

export const broadcaster = SSEBroadcaster.getInstance();

/** Convenience: broadcast an event to all connected SSE clients. */
export function broadcast(event: string, data: unknown = {}): void {
  broadcaster.broadcast(event, data);
}

/** Convenience: broadcast a typed orchestrator event */
export function broadcastOrchestratorEvent<T extends OrchestratorEvent['type']>(
  event: T,
  data: Extract<OrchestratorEvent, { type: T }>
): void {
  broadcaster.broadcastTyped(event, data);
}

// ── SSE stream ───────────────────────────────────────────────────────

const PING_INTERVAL_MS = 30_000;

/** Track active SSE client connections. Exported for testing. */
export const _sseClients = new Map<string, { connectedAt: number }>();

app.get('/api/events', async (c) => {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    const clientId = randomUUID().slice(0, 8);
    const tag = `[sse:${clientId}]`;
    let connected = true;
    let resolveDisconnect: (() => void) | undefined;

    _sseClients.set(clientId, { connectedAt: Date.now() });
    console.log(`${tag} Client connected (active=${_sseClients.size})`);

    const onMessage = (payload: SSEEvent) => {
      if (!connected) return;
      try {
        stream.writeSSE({ event: payload.event, data: JSON.stringify(payload) });
      } catch {
        disconnect();
      }
    };

    function disconnect() {
      if (!connected) return;
      connected = false;
      clearInterval(pingTimer);
      broadcaster.off('message', onMessage);
      _sseClients.delete(clientId);
      console.log(`${tag} Client disconnected (active=${_sseClients.size})`);
      resolveDisconnect?.();
    }

    broadcaster.on('message', onMessage);

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ event: 'connected', ts: Date.now() }),
    });

    const pingTimer = setInterval(() => {
      if (!connected) { clearInterval(pingTimer); return; }
      try {
        stream.writeSSE({ event: 'ping', data: JSON.stringify({ event: 'ping', ts: Date.now() }) });
      } catch {
        disconnect();
      }
    }, PING_INTERVAL_MS);

    stream.onAbort(() => disconnect());

    // Keep stream open until client disconnects (no polling needed)
    await new Promise<void>((resolve) => {
      resolveDisconnect = resolve;
      if (!connected) resolve();
    });
  });
});

// ── Debug endpoint (dev only) ────────────────────────────────────────

if (process.env.NODE_ENV === 'development') {
  app.post('/api/events/test', async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const event = (body.event as string) || 'test';
    const data = body.data || { message: 'Test broadcast' };
    broadcast(event, data);
    return c.json({ ok: true, event, data });
  });
}

export default app;
