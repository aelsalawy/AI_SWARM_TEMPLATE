import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.testRun) return true;
  try {
    const createFunc = client.testRun.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/test-runs - list all test runs
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('[TestRuns] Checking if Prisma is no-op proxy...');
    const isProxy = isNoopProxy(prisma);
    console.log('[TestRuns] Is no-op proxy:', isProxy);
    
    if (isProxy) {
      console.log('[TestRuns] Returning empty array due to no-op proxy');
      return res.json([]);
    }

    console.log('[TestRuns] Querying test runs from database...');
    const where: any = {};
    if (req.query.status) where.status = req.query.status as string;
    if (req.query.projectId) where.projectId = req.query.projectId as string;
    if (req.query.ownerId) where.ownerId = req.query.ownerId as string;

    const testRuns = await prisma.testRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    console.log('[TestRuns] Found', testRuns.length, 'test runs');
    res.json(testRuns);
  } catch (error) {
    console.error('Error fetching test runs:', error);
    res.status(500).json({ message: 'Failed to fetch test runs' });
  }
});

// POST /api/test-runs/ci/results - CI hook: submit batch test results, auto-file bugs for failures
// Accepts agent-key auth (X-Agent-Key) OR JWT auth
router.post('/ci/results', async (req: Request, res: Response) => {
  const { runId, group, results, projectId, ownerOverride } = req.body;
  
  // Validate minimum required fields
  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ message: 'runId is required' });
  }
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ message: 'results must be a non-empty array' });
  }

  const userId = (req as any).user?.uid || ownerOverride || 'ci-pipeline';
  const autoFile = req.body.autoFileBugs !== false; // default true
  const created: any[] = [];
  const bugsFiled: any[] = [];

  try {
    for (const r of results) {
      if (!r.name) continue;

      const testRun = await prisma.testRun.create({
        data: {
          name: r.name,
          runId,
          group: r.group || group || null,
          status: r.status || 'Pending',
          duration: r.duration || null,
          color: r.color || null,
          agentGroup: r.agentGroup || null,
          testType: r.testType || null,
          priority: r.priority || null,
          description: r.description || null,
          ownerId: userId,
          projectId: r.projectId || projectId || null,
          createdById: userId,
        },
      });
      created.push(testRun);

      // Auto-file a bug for failed test runs
      if (autoFile && (r.status === 'Failed' || r.status === 'failed')) {
        const bugTitle = `[CI] ${r.name} failed`;
        // Check if bug already exists for this test (avoid duplicates within same run)
        const existingBug = await prisma.bug.findFirst({
          where: { title: bugTitle, ownerId: userId },
          orderBy: { createdAt: 'desc' },
        });
        
        // Only file if no recent duplicate (within last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (!existingBug || existingBug.createdAt < oneDayAgo) {
          const bug = await prisma.bug.create({
            data: {
              title: bugTitle,
              description: `Automated bug filed from CI run \`${runId}\`.\n\n${r.description || 'Test failed during automated run.'}`,
              severity: r.severity || 'High',
              priority: r.priority || 'High',
              status: 'Open',
              stepsToReproduce: r.stepsToReproduce || null,
              expectedBehavior: r.expectedBehavior || null,
              actualBehavior: r.actualBehavior || r.error || null,
              environment: r.environment || null,
              ownerId: userId,
              projectId: r.projectId || projectId || null,
            },
          });
          // Link bug to test run
          await prisma.testRunBug.create({
            data: { testRunId: testRun.id, bugId: bug.id },
          });
          bugsFiled.push({ testRunId: testRun.id, bugId: bug.id, bugTitle: bug.title });
        } else {
          // Link existing bug to this test run instead
          await prisma.testRunBug.create({
            data: { testRunId: testRun.id, bugId: existingBug.id },
          });
          bugsFiled.push({ testRunId: testRun.id, bugId: existingBug.id, bugTitle: existingBug.title, reused: true });
        }
      }
    }

    res.status(201).json({
      runId,
      testRunsCreated: created.length,
      bugsFiled: bugsFiled.length,
      bugs: bugsFiled,
    });
  } catch (error) {
    console.error('[CI] Error processing test results:', error);
    res.status(500).json({ message: 'Failed to process test results' });
  }
});

// GET /api/test-runs/stats/overview - aggregated test-run statistics (pass-rate trends)
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json({ total: 0, byStatus: {}, passRate: 0, trends: [] });
    }

    const projectId = req.query.projectId as string | undefined;
    const group = req.query.group as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const where: any = { createdAt: { gte: since } };
    if (projectId) where.projectId = projectId;
    if (group) where.group = group;

    // Overall stats
    const totalCount = await prisma.testRun.count({ where });
    const statusGroups = await prisma.testRun.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const byStatus: Record<string, number> = {};
    for (const g of statusGroups) {
      byStatus[g.status] = g._count;
    }

    const passed = byStatus['Passed'] || 0;
    const passRate = totalCount > 0 ? Math.round((passed / totalCount) * 10000) / 100 : 0;

    // Daily trends for the period
    const dailyRuns = await prisma.testRun.findMany({
      where,
      select: { status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const trendsMap = new Map<string, { total: number; passed: number }>();
    for (const run of dailyRuns) {
      const day = run.createdAt.toISOString().split('T')[0];
      const entry = trendsMap.get(day) || { total: 0, passed: 0 };
      entry.total++;
      if (run.status === 'Passed') entry.passed++;
      trendsMap.set(day, entry);
    }

    const trends = Array.from(trendsMap.entries()).map(([date, data]) => ({
      date,
      total: data.total,
      passed: data.passed,
      passRate: data.total > 0 ? Math.round((data.passed / data.total) * 10000) / 100 : 0,
    }));

    res.json({
      total: totalCount,
      byStatus,
      passRate,
      trends,
    });
  } catch (error) {
    console.error('Error fetching test run stats:', error);
    res.status(500).json({ message: 'Failed to fetch test run stats' });
  }
});

// GET /api/test-runs/:id - get single test run
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Test run not found (demo mode)' });
    }

    const testRun = await prisma.testRun.findUnique({
      where: { id: req.params.id },
      include: { bugs: { include: { bug: true } } },
    });

    if (!testRun) {
      return res.status(404).json({ message: 'Test run not found' });
    }

    res.json(testRun);
  } catch (error) {
    console.error('Error fetching test run:', error);
    res.status(500).json({ message: 'Failed to fetch test run' });
  }
});

// POST /api/test-runs - create a new test run
router.post('/', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Field "name" is required and must be a non-empty string.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot create test runs in demo mode.' });
    }

    const testRunData = {
      name: name.trim(),
      runId: req.body.runId || null,
      group: req.body.group || null,
      status: req.body.status || 'Pending',
      duration: req.body.duration || null,
      color: req.body.color || null,
      agentGroup: req.body.agentGroup || null,
      testType: req.body.testType || null,
      priority: req.body.priority || null,
      description: req.body.description || null,
      ownerId: req.body.ownerId || (req as any).user?.uid || 'system',
      projectId: req.body.projectId || null,
      createdById: req.body.createdBy || (req as any).user?.uid || null,
    };

    const created = await prisma.testRun.create({
      data: testRunData,
    });

    // Create audit log entry
    try {
      await prisma.auditLog.create({
        data: {
          action: 'CREATE',
          entityType: 'test_run',
          entityId: created.id,
          changes: testRunData,
          userId: testRunData.createdById || 'system',
        },
      });
    } catch (auditErr) {
      console.warn('Failed to create audit log for test run:', auditErr);
    }

    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating test run:', error);
    res.status(500).json({ message: 'Failed to create test run' });
  }
});

// PATCH /api/test-runs/:id - update a test run
router.patch('/:id', async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update test runs in demo mode.' });
    }

    const existing = await prisma.testRun.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Test run not found' });
    }

    const updateData: any = { ...req.body };
    // Don't allow changing id
    delete updateData.id;
    delete updateData.createdAt;

    const updated = await prisma.testRun.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Create audit log entry
    try {
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          entityType: 'test_run',
          entityId: req.params.id,
          changes: updateData,
          userId: (req as any).user?.uid || 'system',
        },
      });
    } catch (auditErr) {
      console.warn('Failed to create audit log for test run update:', auditErr);
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating test run:', error);
    res.status(500).json({ message: 'Failed to update test run' });
  }
});

// POST /api/test-runs/:id/result - submit a test result
router.post('/:id/result', async (req: Request, res: Response) => {
  const { status, duration } = req.body;
  if (!status || !['Passed', 'Failed', 'Skipped', 'Pending'].includes(status)) {
    return res.status(400).json({ message: 'Field "status" is required and must be one of: Passed, Failed, Skipped, Pending.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot submit test results in demo mode.' });
    }

    const existing = await prisma.testRun.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Test run not found' });
    }

    const updateData: any = { status };
    if (duration !== undefined) updateData.duration = duration;

    const updated = await prisma.testRun.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Create audit log entry
    try {
      await prisma.auditLog.create({
        data: {
          action: 'RESULT',
          entityType: 'test_run',
          entityId: req.params.id,
          changes: { status, duration, previousStatus: existing.status },
          userId: (req as any).user?.uid || 'system',
        },
      });
    } catch (auditErr) {
      console.warn('Failed to create audit log for test result:', auditErr);
    }

    res.json(updated);
  } catch (error) {
    console.error('Error submitting test result:', error);
    res.status(500).json({ message: 'Failed to submit test result' });
  }
});

// GET /api/test-runs/:id/bugs - get bugs linked to a test run
router.get('/:id/bugs', async (req: Request, res: Response) => {
  try {
    const links = await prisma.testRunBug.findMany({
      where: { testRunId: req.params.id },
      include: { bug: true },
    });
    res.json(links.map(l => l.bug));
  } catch (error) {
    console.error('Error fetching test run bugs:', error);
    res.status(500).json({ message: 'Failed to fetch test run bugs' });
  }
});

// POST /api/test-runs/:id/bugs - link a bug to a test run
router.post('/:id/bugs', async (req: Request, res: Response) => {
  const { bugId } = req.body;
  if (!bugId) {
    return res.status(400).json({ message: 'bugId is required' });
  }
  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({ where: { id: req.params.id } });
    if (!testRun) return res.status(404).json({ message: 'Test run not found' });
    // Verify bug exists
    const bug = await prisma.bug.findUnique({ where: { id: bugId } });
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const link = await prisma.testRunBug.create({
      data: { testRunId: req.params.id, bugId },
    });
    res.status(201).json(link);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Bug already linked to this test run' });
    }
    console.error('Error linking bug to test run:', error);
    res.status(500).json({ message: 'Failed to link bug' });
  }
});

// DELETE /api/test-runs/:id/bugs/:bugId - unlink a bug from a test run
router.delete('/:id/bugs/:bugId', async (req: Request, res: Response) => {
  try {
    const link = await prisma.testRunBug.findFirst({
      where: { testRunId: req.params.id, bugId: req.params.bugId },
    });
    if (!link) return res.status(404).json({ message: 'Link not found' });
    await prisma.testRunBug.delete({ where: { id: link.id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error unlinking bug from test run:', error);
    res.status(500).json({ message: 'Failed to unlink bug' });
  }
});

// DELETE /api/test-runs/:id - delete a test run
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot delete test runs in demo mode.' });
    }

    const existing = await prisma.testRun.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Test run not found' });
    }

    await prisma.testRun.delete({
      where: { id: req.params.id },
    });

    // Create audit log entry
    try {
      await prisma.auditLog.create({
        data: {
          action: 'DELETE',
          entityType: 'test_run',
          entityId: req.params.id,
          changes: existing,
          userId: (req as any).user?.uid || 'system',
        },
      });
    } catch (auditErr) {
      console.warn('Failed to create audit log for test run deletion:', auditErr);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting test run:', error);
    res.status(500).json({ message: 'Failed to delete test run' });
  }
});

// POST /api/ci/test-results - CI hook: submit batch test results, auto-file bugs for failures
// Accepts agent-key auth (X-Agent-Key) OR JWT auth


export default router;
