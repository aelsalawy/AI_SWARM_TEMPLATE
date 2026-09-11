import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { verifyRequestAuth } from './local-auth';
import { agentTelemetry } from './telemetry';
import { prisma } from './prisma';
import tasksRouter from './routes/tasks';
import requirementsRouter from './routes/requirements';
import agentsRouter from './routes/agents';
import testRunsRouter from './routes/test-runs';
import auditRouter from './routes/audit';
import authRouter from './routes/auth';
import authLocalRouter from './routes/auth-local';
import authGoogleRouter from './routes/auth-google';
import bugsRouter from './routes/bugs';
import projectsRouter from './routes/projects';
import sprintsRouter from './routes/sprints';
import releasesRouter from './routes/releases';
// REMOVED: dispatcher, workflow, and trigger-agent routers (Firebase-dependent / dead stub)
import skillsRouter from './routes/skills';
import skillsLoopRouter from './routes/skills-loop';
// REMOVED 2026-09-08 (T1): agentTriggerRouter — dead stub + leaked-key source; replaced by dispatches router
import dispatchesRouter from './routes/dispatches';
import dispatchViewsRouter from './routes/dispatch-views';
import { startDispatchSweeper } from './services/dispatch-sweeper';
import agentChatsRouter from './routes/agent-chats';
import deploymentsRouter from './routes/deployments';
import eventsRouter from './routes/events';
import apiKeysRouter from './routes/api-keys';
import notificationsRouter from './routes/notifications';
import keysRouter from './routes/agent-keys';
import { verifyAgentKeyAuth } from './lib/agent-keys';

import usersRouter from './routes/users';
// REMOVED: migrateFirebaseToPg (Firebase migration endpoint, no longer needed)
// REMOVED: workflow-engine and dispatcher imports (Firebase-dependent). event-bus is LIVE (SSE /api/events + task events).


// Load environment variables
dotenv.config();

// Build metadata for versioned health checks (P0-1).
// BUILD_TIMESTAMP is injected by the deploy pipeline; APP_VERSION is the release tag.
const BUILD_TIMESTAMP = process.env.BUILD_TIMESTAMP || new Date().toISOString();
const APP_VERSION = process.env.APP_VERSION || '0.0.0';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const isProduction = process.env.NODE_ENV === 'production';
const productionOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : []; // Default: no origins allowed in production if not configured

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return callback(null, true);

    if (!isProduction) {
      // Development: allow all origins
      return callback(null, true);
    }

    // Production: restrict to configured origins
    if (productionOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS not allowed'));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Required for cookies (OAuth state)
}));

app.use(express.json());
app.use(cookieParser());

// Auth middleware — require valid JWT token OR agent API key on all /api/* routes except public endpoints
const AGENT_API_KEY = process.env.AGENT_API_KEY || '';

app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  // Public endpoints (no auth required)
  const publicPaths = [
    '/health',
    '/events',
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/logout',
    '/auth/reset-password',
    '/auth/google',
    '/auth/google/callback',
  ];

  if (publicPaths.some(path => req.path.startsWith(path))) {
    console.log('[Auth] Public path:', req.path);
    return next();
  }

  // Agent API key auth (machine-to-machine) — verified per-agent-key.
  // verifyAgentKeyAuth: no agent headers → next() (other auth handles);
  // valid key → binds identity + next(); invalid → 401/500 itself.
  if (req.headers['x-agent-key'] && req.headers['x-agent-id']) {
    await verifyAgentKeyAuth(req, res, next);
    return; // chain advanced or response already sent
  }
  // Break-glass: legacy shared AGENT_API_KEY remains accepted
  if (AGENT_API_KEY) {
    const agentKey = req.headers['x-agent-key'] as string | undefined;
    if (agentKey === AGENT_API_KEY) {
      // Extract agent identity from header if provided
      const agentId = req.headers['x-agent-id'] as string | undefined;
      (req as any).user = {
        uid: agentId || 'agent:system',
        userId: agentId || 'agent:system',
        agent: true,
      };
      (req as any).isAgent = true;
      return next();
    }
  }

  // JWT access token auth (browser / user)
  verifyRequestAuth(req).then(decoded => {
    if (!decoded) {
      return res.status(401).json({ message: 'Authentication required. Provide Authorization: Bearer <token>, X-Access-Token, or X-Agent-Key header.' });
    }
    // Attach user info for downstream use
    (req as any).user = {
      uid: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  }).catch(() => {
    res.status(401).json({ message: 'Invalid or expired authentication token.' });
  });
});

// R2-8: per-agent telemetry middleware. Runs after auth so it can resolve the
// authenticated agent identity and record latency on agent API calls.
app.use('/api', agentTelemetry);

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  let prismaStatus = 'not_initialized';
  let taskCount = 0;
  let agentCount = 0;

  try {
    await prisma.$connect();
    prismaStatus = 'connected';

    // Get counts
    taskCount = await prisma.task.count();
    agentCount = await prisma.agent.count();
  } catch (error) {
    prismaStatus = 'unavailable';
    console.error('Health check failed:', error);
  }

  res.json({
    status: 'ok',
    mode: 'live',
    prisma: prismaStatus,
    agents: agentCount,
    tasks: taskCount,
    buildTimestamp: BUILD_TIMESTAMP,
    version: APP_VERSION,
  });
});

// API routes — all routes handle null db internally
app.use('/api/users', usersRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/requirements', requirementsRouter);
// keysRouter MUST mount before agentsRouter: its GET /me would otherwise be
// swallowed by agentsRouter's GET /:id ('me' would 404 as an agent id).
app.use('/api/agents', keysRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/agents', agentChatsRouter);
app.use('/api/test-runs', testRunsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/auth', authLocalRouter);  // Local auth takes priority (migrating from Firebase)
app.use('/api/auth', authGoogleRouter); // Google OAuth
app.use('/api/auth', authRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/sprints', sprintsRouter);
app.use('/api/releases', releasesRouter);
// REMOVED: /api/dispatcher and /api/workflow routes (Firebase-dependent, postponed)
app.use('/api/deployments', deploymentsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/api-keys', apiKeysRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/skills', skillsLoopRouter);
// REMOVED 2026-09-08 (T1): /api/agent-trigger — dead stub, was never wired to a real spawn
app.use('/api/dispatches', dispatchesRouter);
// T7: GET dispatch-state endpoints (tasks/bugs) — mounted alongside the dispatches router.
app.use('/api', dispatchViewsRouter);


// REMOVED: Google callback proxy (dead code — auth-google.ts has its own route)

// REMOVED: /api/admin/migrate-firebase (Firebase migration, no longer needed)

// REMOVED: workflow engine init, event bus wiring, and auto-dispatch
// (Firebase-dependent, postponed to future phase)

// 404 handler
app.use((req: _Request, res: Response) => {
  console.log('[Server] 404 handler reached for:', req.method, req.url);
  res.status(404).json({ message: 'Not found' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Workflow Engine: Removed (Firebase-dependent, postponed)');
  // T7: start the 4-pass dispatch sweeper once at boot (S1–S4 + auto-resolution).
  startDispatchSweeper();
});

export default app;
