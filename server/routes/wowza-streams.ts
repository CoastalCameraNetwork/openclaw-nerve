/**
 * Wowza Stream Management API
 *
 * POST   /api/wowza/streams          - Create new stream
 * GET    /api/wowza/streams          - List all streams
 * GET    /api/wowza/streams/:id      - Get stream details
 * PUT    /api/wowza/streams/:id      - Update stream
 * DELETE /api/wowza/streams/:id      - Delete stream
 *
 * @module
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';

const app = new Hono();

// ── Types ─────────────────────────────────────────────────────────────

interface WowzaStream {
  id: string;
  name: string;
  applicationName: string;
  streamType: 'live' | 'record' | 'microphone';
  sourceType: 'rtmp' | 'srt' | 'webrtc' | 'file' | 'sdirect';
  sourceUrl?: string | null;
  destinationUrl?: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown> | null;
  description?: string | null;
}

// ── In-memory store (for now; can be replaced with database later) ───

const streams: Record<string, WowzaStream> = {};

// ── Zod schemas ──────────────────────────────────────────────────────

const streamTypeSchema = z.enum(['live', 'record', 'microphone']);
const sourceTypeSchema = z.enum(['rtmp', 'srt', 'webrtc', 'file', 'sdirect']);

const createStreamSchema = z.object({
  name: z.string().min(1).max(100),
  applicationName: z.string().min(1).max(100).default('live'),
  streamType: streamTypeSchema.default('live'),
  sourceType: sourceTypeSchema.default('rtmp'),
  sourceUrl: z.string().max(500).optional(),
  destinationUrl: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

const updateStreamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  applicationName: z.string().min(1).max(100).optional(),
  streamType: streamTypeSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  sourceUrl: z.string().max(500).optional().nullable(),
  destinationUrl: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

// ── Helper functions ─────────────────────────────────────────────────

function generateId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function now(): number {
  return Date.now();
}

// ── Routes ───────────────────────────────────────────────────────────

// POST /api/wowza/streams - Create new stream
app.post('/api/wowza/streams', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'validation_error', details: 'Invalid JSON body' }, 400);
  }

  const parsed = createStreamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }, 400);
  }

  const id = generateId();
  const stream: WowzaStream = {
    id,
    name: parsed.data.name,
    applicationName: parsed.data.applicationName,
    streamType: parsed.data.streamType,
    sourceType: parsed.data.sourceType,
    sourceUrl: parsed.data.sourceUrl,
    destinationUrl: parsed.data.destinationUrl,
    enabled: parsed.data.enabled,
    metadata: parsed.data.metadata ?? undefined,
    description: parsed.data.description,
    createdAt: now(),
    updatedAt: now(),
  };

  streams[id] = stream;

  return c.json(stream, 201);
});

// GET /api/wowza/streams - List all streams
app.get('/api/wowza/streams', async (c) => {
  const url = new URL(c.req.url);
  const enabledParam = url.searchParams.get('enabled');

  let result = Object.values(streams);

  if (enabledParam !== null) {
    const enabled = enabledParam === 'true';
    result = result.filter((s) => s.enabled === enabled);
  }

  // Optional query params for filtering
  const applicationName = url.searchParams.get('applicationName');
  if (applicationName) {
    result = result.filter((s) => s.applicationName === applicationName);
  }

  const streamType = url.searchParams.get('streamType');
  if (streamType) {
    result = result.filter((s) => s.streamType === streamType);
  }

  const sourceType = url.searchParams.get('sourceType');
  if (sourceType) {
    result = result.filter((s) => s.sourceType === sourceType);
  }

  // Pagination (optional)
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  let finalResult = result;
  if (offset) {
    const offsetNum = parseInt(offset, 10);
    if (!isNaN(offsetNum) && offsetNum > 0) {
      finalResult = finalResult.slice(offsetNum);
    }
  }
  if (limit) {
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      finalResult = finalResult.slice(0, limitNum);
    }
  }

  const totalCount = result.length;

  return c.json({
    streams: finalResult,
    pagination: {
      total: totalCount,
      limit: limit ? parseInt(limit, 10) : totalCount,
      offset: offset ? parseInt(offset, 10) : 0,
    },
  });
});

// GET /api/wowza/streams/:id - Get stream details
app.get('/api/wowza/streams/:id', async (c) => {
  const id = c.req.param('id');

  const stream = streams[id];
  if (!stream) {
    return c.json({ error: 'not_found', details: `Stream with id '${id}' not found` }, 404);
  }

  return c.json(stream);
});

// PUT /api/wowza/streams/:id - Update stream
app.put('/api/wowza/streams/:id', async (c) => {
  const id = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'validation_error', details: 'Invalid JSON body' }, 400);
  }

  const parsed = updateStreamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }, 400);
  }

  const existingStream = streams[id];
  if (!existingStream) {
    return c.json({ error: 'not_found', details: `Stream with id '${id}' not found` }, 404);
  }

  // Apply updates with proper null handling
  const updates: Partial<WowzaStream> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.applicationName !== undefined) updates.applicationName = parsed.data.applicationName;
  if (parsed.data.streamType !== undefined) updates.streamType = parsed.data.streamType;
  if (parsed.data.sourceType !== undefined) updates.sourceType = parsed.data.sourceType;
  if (parsed.data.sourceUrl !== undefined) updates.sourceUrl = parsed.data.sourceUrl;
  if (parsed.data.destinationUrl !== undefined) updates.destinationUrl = parsed.data.destinationUrl;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata === null ? null : parsed.data.metadata;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description === null ? null : parsed.data.description;

  // Apply updates
  const updatedStream: WowzaStream = {
    ...existingStream,
    ...updates,
    updatedAt: now(),
  };

  streams[id] = updatedStream;

  return c.json(updatedStream);
});

// DELETE /api/wowza/streams/:id - Delete stream
app.delete('/api/wowza/streams/:id', async (c) => {
  const id = c.req.param('id');

  if (!streams[id]) {
    return c.json({ error: 'not_found', details: `Stream with id '${id}' not found` }, 404);
  }

  delete streams[id];

  return c.json({ ok: true, id });
});

export default app;
