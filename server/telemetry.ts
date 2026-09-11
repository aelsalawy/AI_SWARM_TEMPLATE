import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from './prisma';

/**
 * R2-8: Lightweight per-agent telemetry middleware.
 *
 * Captures a row in the `agent_telemetry` table (agentId, endpoint, latencyMs,
 * createdAt) for every /api request where an agent identity can be resolved:
 *   - `x-agent-id` request header (agent-key / machine-to-machine calls), or
 *   - `req.isAgent === true` with a populated `req.user.uid`/`userId` (agent API key auth)
 *
 * Human/unauth requests are ignored, keeping the middleware cheap and out of the
 * way of normal browser traffic. Telemetry writes are fire-and-forget and never
 * block or fail the request.
 */

const agentPrismaRef = { getPrismaClient };

function resolveAgentId(req: Request): string | null {
  const headerId = req.headers['x-agent-id'] as string | undefined;
  if (headerId && headerId.trim()) return headerId.trim();

  if ((req as any).isAgent === true) {
    const user = (req as any).user;
    if (user?.agentId) return user.agentId;
    if (user?.uid) return user.uid;
    if (user?.userId) return user.userId;
  }
  return null;
}

const SKIP_ENDPOINTS = new Set(['/api/agents/telemetry/summary', '/api/health']);

export function agentTelemetry(req: Request, res: Response, next: NextFunction) {
  const agentId = resolveAgentId(req);
  if (!agentId) return next();

  if (SKIP_ENDPOINTS.has(req.path)) return next();

  const endpoint = req.originalUrl || req.path || '/';
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const latencyMs = Number((process.hrtime.bigint() - start) / 1000000n); // ns -> ms
    // Fire-and-forget; never block the response.
    try {
      const prisma = agentPrismaRef.getPrismaClient();
      if (!prisma || !prisma.agentTelemetry) return;
      prisma.agentTelemetry
        ?.create?.({
          data: {
            agentId,
            endpoint,
            latencyMs: Math.max(0, Math.round(latencyMs)),
          },
        })
        .catch((err: any) => {
          console.warn('[telemetry] write failed:', err?.message);
        });
    } catch (err: any) {
      console.warn('[telemetry] error:', err?.message);
    }
  });

  next();
}
