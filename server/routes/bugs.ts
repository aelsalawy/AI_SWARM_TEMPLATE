import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';
import { dispatchAssignment, cancelAssignment } from '../services/agent-dispatch';

const router = Router();
const prisma = getPrismaClient();

// R2-9: normalize incoming tag arrays (trim, drop empties, dedupe case-insensitive, max 12 x 40 chars)
const normalizeTagsInput = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const trimmed = t.trim().slice(0, 40);
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= 12) break;
  }
  return out;
};

// Status normalization map
const STATUS_MAP: Record<string, string> = {
  'In Progress': 'In_Progress',
  'In_Progress': 'In_Progress',
  'Open': 'Open',
  'Resolved': 'Resolved',
  'Closed': 'Closed',
};

// Demo data for when Prisma is not connected
const demoBugs: any[] = [];

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.bug) return true;
  
  // Check if bug.create is the no-op proxy function
  try {
    const createFunc = client.bug.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/bugs - list all bugs with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check if Prisma is available and not a no-op proxy
    if (isNoopProxy(prisma)) {
      return res.json(demoBugs);
    }

    // Build Prisma query based on filters
    const where: any = {};

    // Apply filters
    if (req.query.status) {
      const rawStatus = req.query.status as string;
      const normalizedStatus = STATUS_MAP[rawStatus] || rawStatus;
      where.status = normalizedStatus;
      console.log('[Bugs API] Status filter:', { rawStatus, normalizedStatus });
    }
    if (req.query.priority) {
      const rawPriority = req.query.priority as string;
      // Normalize priority if needed (currently using exact match)
      where.priority = rawPriority;
    }
    if (req.query.ownerId) {
      where.ownerId = req.query.ownerId as string;
    }
    if (req.query.projectId) {
      where.projectId = req.query.projectId as string;
    }
    if (req.query.sprintId) {
      where.sprintId = req.query.sprintId as string;
    }
    if (req.query.release) {
      where.release = req.query.release as string;
    }

    const bugs = await prisma.bug.findMany({
      where,
      include: {
        sprint: true,
        comments: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    console.log('[Bugs API] Query result:', { where, bugCount: bugs.length });

    // Convert to the expected format
    const formattedBugs = bugs.map(bug => ({
      id: bug.id,
      title: bug.title,
      description: bug.description,
      priority: bug.priority,
      status: bug.status,
      severity: bug.severity,
      stepsToReproduce: bug.stepsToReproduce,
      expectedBehavior: bug.expectedBehavior,
      actualBehavior: bug.actualBehavior,
      environment: bug.environment,
      assignedAgentId: bug.assignedAgentId,
      projectId: bug.projectId,
      ownerId: bug.ownerId,
      createdAt: bug.createdAt,
      updatedAt: bug.updatedAt,
      tags: bug.tags ?? [],
      sprintId: bug.sprintId,
      release: bug.release,
      comments: bug.comments || [],
      history: [] // Populated on single-item fetch
    }));

    res.json(formattedBugs);
  } catch (error: any) {
    console.error('[Bugs API] Error fetching bugs:', error);
    console.error('[Bugs API] Error stack:', error?.stack);
    res.status(500).json({ message: 'Failed to fetch bugs' });
  }
});

// GET /api/bugs/:id - get single bug
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Bug not found (demo mode)' });
    }

    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: {
        sprint: true,
        comments: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        history: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    const formattedBug = {
      id: bug.id,
      title: bug.title,
      description: bug.description,
      priority: bug.priority,
      status: bug.status,
      severity: bug.severity,
      stepsToReproduce: bug.stepsToReproduce,
      expectedBehavior: bug.expectedBehavior,
      actualBehavior: bug.actualBehavior,
      environment: bug.environment,
      assignedAgentId: bug.assignedAgentId,
      projectId: bug.projectId,
      ownerId: bug.ownerId,
      createdAt: bug.createdAt,
      updatedAt: bug.updatedAt,
      tags: bug.tags ?? [],
      sprintId: bug.sprintId,
      release: bug.release,
      comments: bug.comments || [],
      history: bug.history || []
    };

    res.json(formattedBug);
  } catch (error) {
    console.error('Error fetching bug:', error);
    res.status(500).json({ message: 'Failed to fetch bug' });
  }
});

// POST /api/bugs - create bug
router.post('/', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Field "title" is required and must be a non-empty string.' });
  }
  
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot create bugs in demo mode.' });
    }

    // Validate FK references before write — otherwise Prisma throws and client gets an opaque 500
    if (req.body.assignedAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: req.body.assignedAgentId } });
      if (!agent) {
        return res.status(400).json({ message: `assignedAgentId "${req.body.assignedAgentId}" does not exist.` });
      }
    }
    if (req.body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: req.body.projectId } });
      if (!project) {
        return res.status(400).json({ message: `projectId "${req.body.projectId}" does not exist.` });
      }
    }
    if (req.body.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
      if (!sprint) {
        return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
      }
    }

    const bugData = {
      ...req.body,
      title: title.trim(),
      description: req.body.description?.trim() || null,
      ownerId: req.body.ownerId || process.env.DEFAULT_OWNER_ID || undefined,
      projectId: req.body.projectId || process.env.DEFAULT_PROJECT_ID || undefined,
      priority: req.body.priority || 'Medium',
      status: req.body.status || 'Open',
      assignedAgentId: req.body.assignedAgentId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: req.body.tags !== undefined ? normalizeTagsInput(req.body.tags) : undefined,
      release: typeof req.body.release === 'string' ? req.body.release.trim().slice(0, 40) || undefined : undefined
    };
    // Remove undefined fields so Prisma doesn't store null
    Object.keys(bugData).forEach(key => bugData[key] === undefined && delete bugData[key]);
    
    const createdBug = await prisma.bug.create({
      data: bugData
    });

    // W6 dispatch: route assignment through the centralized helper (G6 parity).
    // pm mode → [ASSIGNMENT-REVIEW] row to PM inbox; direct mode → assignee spawn.
    if (createdBug.assignedAgentId) {
      try {
        await dispatchAssignment({
          agentId: createdBug.assignedAgentId,
          itemType: 'bug',
          itemId: createdBug.id,
          itemTitle: createdBug.title,
        });
      } catch (e) {
        console.warn('[bugs] POST-create dispatch failed (non-fatal):', e);
      }
    }

    // Emit bug.created event
    try {
      console.log(`[Bugs] Bug created: ${createdBug.id}`);
    } catch (e) {
      console.warn('[Bugs] Failed to log bug creation:', e);
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entityType: 'bug',
        entityId: createdBug.id,
        changes: bugData,
        userId: (req as any).user?.uid || req.body.createdBy || 'system'
      }
    });

    const responseBug = {
      id: createdBug.id,
      ...bugData,
      comments: [],
      history: []
    };

    res.status(201).json(responseBug);
  } catch (error) {
    console.error('Error creating bug:', error);
    res.status(500).json({ message: 'Failed to create bug' });
  }
});

// PATCH /api/bugs/:id - update bug
router.patch('/:id', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  // NEW: Agent scoping parity (mirrors tasks.ts:299-326) — agents can only
  // touch bugs assigned to them, and only via a whitelist of status/comment
  // fields. Assignment-field changes (assignedAgentId, projectId, sprintId,
  // ownerId, etc.) are rejected with 403 for agent callers (R7 spawn-loop guard).
  // Human JWT callers are unaffected. This MUST run before the dispatch wiring
  // below so out-of-policy agent requests never reach dispatchAssignment.
  const isAgentCaller = (req as any).isAgent === true;
  if (isAgentCaller) {
    const callerAgentId = (req as any).user?.uid;
    if (!callerAgentId) {
      return res.status(401).json({ message: 'Unable to determine agent identity' });
    }

    // Check if bug is assigned to this agent
    const bugToCheck = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });

    if (!bugToCheck) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    if (bugToCheck.assignedAgentId !== callerAgentId) {
      return res.status(403).json({ message: 'Forbidden: agents can only update bugs assigned to them' });
    }

    // Whitelist: agents may only update status (to In_Progress/Resolved) and
    // comment-type bookkeeping fields. Any assignment-field change is rejected.
    const AGENT_ALLOWED_FIELDS = new Set(['status', 'changedBy']);
    const ASSIGNMENT_FIELDS = ['assignedAgentId', 'projectId', 'sprintId', 'ownerId', 'release'];
    for (const key of Object.keys(req.body)) {
      if (ASSIGNMENT_FIELDS.includes(key)) {
        return res.status(403).json({ message: `Forbidden: agents cannot change assignment field "${key}"` });
      }
      if (!AGENT_ALLOWED_FIELDS.has(key)) {
        return res.status(403).json({ message: `Forbidden: agents can only update status (field "${key}" is not allowed)` });
      }
    }

    // Agents can only transition to In_Progress or Resolved (accept UI labels via map)
    if (req.body.status && !['In_Progress', 'In Progress', 'Resolved'].includes(req.body.status)) {
      return res.status(403).json({ message: 'Forbidden: agents can only transition bugs to In_Progress or Resolved' });
    }
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update bugs in demo mode.' });
    }

    // Get current bug data
    const currentBug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: { comments: true }
    });

    if (!currentBug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    // Validate FK references before write — otherwise Prisma throws and client gets an opaque 500
    if (req.body.assignedAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: req.body.assignedAgentId } });
      if (!agent) {
        return res.status(400).json({ message: `assignedAgentId "${req.body.assignedAgentId}" does not exist.` });
      }
    }
    if (req.body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: req.body.projectId } });
      if (!project) {
        return res.status(400).json({ message: `projectId "${req.body.projectId}" does not exist.` });
      }
    }
    if (req.body.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
      if (!sprint) {
        return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
      }
    }

    const updateData = {
      ...req.body,
      ...(req.body.tags !== undefined ? { tags: normalizeTagsInput(req.body.tags) } : {}),
      ...(req.body.release !== undefined ? { release: typeof req.body.release === 'string' ? req.body.release.trim().slice(0, 40) || null : null } : {}),
      updatedAt: new Date()
    };
    
    const updatedBug = await prisma.bug.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Record history for changed fields
    const changedBy = req.body.changedBy || 'system';
    const trackableFields = ['title', 'description', 'status', 'priority', 'assignedAgentId', 'projectId'];
    const historyEntries: any[] = [];
    for (const field of trackableFields) {
      if (field in req.body && req.body[field] !== (currentBug as any)[field]) {
        historyEntries.push({
          bugId: req.params.id,
          field,
          fromValue: String((currentBug as any)[field] ?? ''),
          toValue: String(req.body[field] ?? ''),
          changedBy,
          createdAt: new Date()
        });
      }
    }
    if (historyEntries.length > 0) {
      await prisma.bugHistory.createMany({ data: historyEntries });
    }

    // 🔔 AUTO-TRIGGER AGENT if assignedAgentId is set or changed
    if (req.body.assignedAgentId && req.body.assignedAgentId !== currentBug.assignedAgentId) {
      // W5 dispatch: route the assignment through the centralized helper (G6 parity).
      // pm mode → [ASSIGNMENT-REVIEW] row to PM inbox; direct mode → assignee spawn.
      try {
        await dispatchAssignment({
          agentId: req.body.assignedAgentId,
          itemType: 'bug',
          itemId: req.params.id,
          itemTitle: currentBug.title,
        });
      } catch (e) {
        console.warn('[bugs] PATCH assign dispatch failed (non-fatal):', e);
      }
    }

    // Unassignment: if the bug previously had an assignee and it is being removed
    // (set to null) or reassigned to a different agent, cancel the old dispatch row
    // (pmState/wakeState → cancelled) so no stale review/spawn lingers.
    if (currentBug.assignedAgentId && req.body.assignedAgentId !== currentBug.assignedAgentId) {
      try {
        await cancelAssignment({
          agentId: currentBug.assignedAgentId,
          itemType: 'bug',
          itemId: req.params.id,
        });
      } catch (e) {
        console.warn('[bugs] PATCH unassign cancel failed (non-fatal):', e);
      }
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entityType: 'bug',
        entityId: req.params.id,
        changes: updateData,
        userId: changedBy
      }
    });

    const updatedDoc = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: {
        sprint: true,
        comments: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        history: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Bug not found after update' });
    }

    // Emit bug events
    try {
      const prevStatus = currentBug.status;
      const newStatus = req.body.status;
      if (newStatus === 'Resolved' && prevStatus !== 'Resolved') {
        console.log(`[Bugs] Bug resolved: ${req.params.id}`);
      }
    } catch (e) {
      console.warn('[Bugs] Failed to log bug resolution:', e);
    }

    const formattedBug = {
      id: updatedDoc.id,
      title: updatedDoc.title,
      description: updatedDoc.description,
      priority: updatedDoc.priority,
      status: updatedDoc.status,
      severity: updatedDoc.severity,
      stepsToReproduce: updatedDoc.stepsToReproduce,
      expectedBehavior: updatedDoc.expectedBehavior,
      actualBehavior: updatedDoc.actualBehavior,
      environment: updatedDoc.environment,
      assignedAgentId: updatedDoc.assignedAgentId,
      projectId: updatedDoc.projectId,
      ownerId: updatedDoc.ownerId,
      createdAt: updatedDoc.createdAt,
      updatedAt: updatedDoc.updatedAt,
      tags: updatedDoc.tags ?? [],
      sprintId: updatedDoc.sprintId,
      release: updatedDoc.release,
      comments: updatedDoc.comments || [],
      history: updatedDoc.history || []
    };

    res.json(formattedBug);
  } catch (error) {
    console.error('Error updating bug:', error);
    res.status(500).json({ message: 'Failed to update bug' });
  }
});

// DELETE /api/bugs/:id - delete bug
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot delete bugs in demo mode.' });
    }

    // Get bug data before deletion
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });

    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    // Delete child records first to avoid FK violations (bugs with history/comments/links could never be deleted before)
    await prisma.bugHistory.deleteMany({ where: { bugId: req.params.id } });
    await prisma.bugComment.deleteMany({ where: { bugId: req.params.id } });
    await prisma.bugAttachment.deleteMany({ where: { bugId: req.params.id } });
    await prisma.requirementBug.deleteMany({ where: { bugId: req.params.id } });
    await prisma.testRunBug.deleteMany({ where: { bugId: req.params.id } });
    // FIX (cmttteqyj00cjkclc8txq1qkq): cascade AgentDispatch rows for this bug so
    // deleting a bug does not leave orphaned dispatch rows. itemType matches
    // agent-dispatch.ts (fetchItem/dispatchAssignment use 'bug'). We do NOT clean
    // the assignee's inbox [ASSIGNMENT] messages here — the sweeper handles orphans.
    await prisma.agentDispatch.deleteMany({ where: { itemType: 'bug', itemId: req.params.id } });

    // Delete the bug
    await prisma.bug.delete({
      where: { id: req.params.id }
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'DELETE',
        entityType: 'bug',
        entityId: req.params.id,
        changes: bug,
        userId: 'system'
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bug:', error);
    res.status(500).json({ message: 'Failed to delete bug' });
  }
});

// POST /api/bugs/:id/attachments - upload image attachment to a bug (base64)
router.post('/:id/attachments', async (req: Request, res: Response) => {
  // Input validation
  const { data, filename, mimeType } = req.body;
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ message: 'Field "data" is required and must be a base64-encoded string.' });
  }
  if (!mimeType || typeof mimeType !== 'string') {
    return res.status(400).json({ message: 'Field "mimeType" is required (e.g. image/png, image/jpeg).' });
  }
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
    return res.status(400).json({ message: `Unsupported mimeType. Allowed: ${allowedMimeTypes.join(', ')}` });
  }
  // Limit base64 payload to ~5MB decoded (~6.7MB base64)
  const MAX_BASE64_SIZE = 7 * 1024 * 1024;
  if (data.length > MAX_BASE64_SIZE) {
    return res.status(413).json({ message: 'Attachment too large. Maximum size is ~5MB.' });
  }
  
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot upload attachments in demo mode.' });
    }

    // Verify bug exists
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });
    
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    // Build attachment record
    const attachmentData = {
      filename: filename || `attachment-${Date.now()}`,
      mimeType,
      size: Math.floor((data.length * 3) / 4), // approximate decoded size
      storageType: 'base64',
      data, // store base64 inline in database
      uploadedBy: req.body.uploadedBy || (req as any).user?.uid || 'system',
      bugId: req.params.id,
      createdAt: new Date()
    };

    // Create attachment
    const createdAttachment = await prisma.bugAttachment.create({
      data: attachmentData
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'ATTACH_FILE',
        entityType: 'bug_attachment',
        entityId: createdAttachment.id,
        changes: { filename: attachmentData.filename, mimeType, size: attachmentData.size },
        userId: attachmentData.uploadedBy
      }
    });

    const attachmentSummary = {
      id: createdAttachment.id,
      filename: attachmentData.filename,
      mimeType: attachmentData.mimeType,
      size: attachmentData.size,
      uploadedBy: attachmentData.uploadedBy,
      createdAt: attachmentData.createdAt,
      // data omitted from summary to avoid duplication
    };

    res.status(201).json(attachmentSummary);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ message: 'Failed to upload attachment' });
  }
});

// GET /api/bugs/:id/attachments - list attachments for a bug
router.get('/:id/attachments', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    // Verify bug exists
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });
    
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    // Get attachments for the bug
    const attachments = await prisma.bugAttachment.findMany({
      where: { bugId: req.params.id },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Convert to the expected format (summary without data)
    const formattedAttachments = attachments.map(attachment => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt
    }));

    res.json(formattedAttachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ message: 'Failed to fetch attachments' });
  }
});

// GET /api/bugs/:id/attachments/:attachId - download a specific attachment
router.get('/:id/attachments/:attachId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Attachment not found (demo mode)' });
    }

    const attachment = await prisma.bugAttachment.findUnique({
      where: { id: req.params.attachId }
    });

    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    res.json({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt,
      data: attachment.data
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ message: 'Failed to fetch attachment' });
  }
});

// DELETE /api/bugs/:id/attachments/:attachId - remove an attachment
router.delete('/:id/attachments/:attachId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected.' });
    }

    // Verify bug exists
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });
    
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    // Get attachment data before deletion
    const attachment = await prisma.bugAttachment.findUnique({
      where: { id: req.params.attachId }
    });

    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // Delete the attachment
    await prisma.bugAttachment.delete({
      where: { id: req.params.attachId }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'DELETE_ATTACHMENT',
        entityType: 'bug_attachment',
        entityId: req.params.attachId,
        changes: { filename: attachment.filename, mimeType: attachment.mimeType },
        userId: (req as any).user?.uid || 'system'
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Failed to delete attachment' });
  }
});

// POST /api/bugs/:id/comments - add a comment to a bug
router.post('/:id/comments', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  const { text, authorId, authorName } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'Field "text" is required and must be a non-empty string.' });
  }
  if (!authorId || typeof authorId !== 'string') {
    return res.status(400).json({ message: 'Field "authorId" is required and must be a string.' });
  }
  if (!authorName || typeof authorName !== 'string') {
    return res.status(400).json({ message: 'Field "authorName" is required and must be a string.' });
  }
  
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot add comments in demo mode.' });
    }
    
    // Verify bug exists
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });
    
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }
    
    // Create comment data
    const commentData = {
      body: text.trim(),
      authorId,
      authorName,
      bugId: req.params.id,
      createdAt: new Date()
    };
    
    // Add comment to database
    const createdComment = await prisma.bugComment.create({
      data: commentData
    });
    
    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_COMMENT',
        entityType: 'bug_comment',
        entityId: createdComment.id,
        changes: commentData,
        userId: authorId
      }
    });
    
    res.status(201).json({
      id: createdComment.id,
      text: createdComment.body,
      authorId: createdComment.authorId,
      authorName: createdComment.authorName,
      createdAt: createdComment.createdAt
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// GET /api/bugs/:id/comments - list comments for a bug
router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]); // Return empty array in demo mode
    }
    
    // Verify bug exists
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });
    
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }
    
    // Get comments from database, sorted by createdAt ascending
    const comments = await prisma.bugComment.findMany({
      where: { bugId: req.params.id },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    // Convert to the expected format
    const formattedComments = comments.map(comment => ({
      id: comment.id,
      text: comment.body,
      authorId: comment.authorId,
      authorName: comment.authorName,
      createdAt: comment.createdAt
    }));
    
    res.json(formattedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// GET /api/bugs/:id/history - list history entries for a bug
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });

    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    const history = await prisma.bugHistory.findMany({
      where: { bugId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching bug history:', error);
    res.status(500).json({ message: 'Failed to fetch history' });
  }
});

// GET /api/bugs/:id/requirements - list linked requirements for a bug
router.get('/:id/requirements', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id }
    });

    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    const linkedReqs = await prisma.requirementBug.findMany({
      where: { bugId: req.params.id },
      include: { requirement: true }
    });

    const result = linkedReqs.map(lb => ({
      id: lb.requirement.id,
      title: lb.requirement.title,
      status: lb.requirement.status,
      linkType: 'm2m'
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching bug requirements:', error);
    res.status(500).json({ message: 'Failed to fetch requirements' });
  }
});

// GET /api/bugs/:id/test-runs - list test runs linked to a bug
router.get('/:id/test-runs', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const bug = await prisma.bug.findUnique({ where: { id: req.params.id } });
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const links = await prisma.testRunBug.findMany({
      where: { bugId: req.params.id },
      include: { testRun: true },
    });
    res.json(links.map(l => l.testRun));
  } catch (error) {
    console.error('Error fetching bug test runs:', error);
    res.status(500).json({ message: 'Failed to fetch test runs' });
  }
});

export default router;
