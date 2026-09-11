/**
 * Skills API Route — Skill registry and weighted agent-assignment
 *
 * /api/skills/ — GET: aggregate distinct normalized-lowercase tags across all agents
 * /api/skills/suggest — POST: rank agents by skill matching
 */

import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy (demo mode) — same pattern as tasks.ts
function isNoopProxy(client: any): boolean {
  if (!client || !client.agent) return true;
  try {
    const createFunc = client.agent.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// Helper function to normalize tags: trim, drop empties, dedupe case-insensitively
const normalizeTags = (tags: string[]): string[] => {
  if (!tags || !Array.isArray(tags)) return [];
  
  // Trim, filter out empty strings, convert to lowercase for deduplication
  const normalized = tags
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
    .map(tag => tag.toLowerCase());
  
  // Deduplicate while preserving original case of first occurrence
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const tag of tags.map(t => t.trim()).filter(t => t.length > 0)) {
    const lowerTag = tag.toLowerCase();
    if (!seen.has(lowerTag)) {
      seen.add(lowerTag);
      result.push(tag);
    }
  }
  
  return result;
};

// GET '/' → aggregate distinct normalized-lowercase tags across all agents
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Get all agents with their tags
    const agents = await prisma.agent.findMany({
      select: {
        tags: true
      }
    });
    
    // Aggregate tags: normalize, count occurrences
    const tagCounts: Record<string, number> = {};
    
    for (const agent of agents) {
      const normalized = normalizeTags(agent.tags);
      for (const tag of normalized) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    // Convert to array format and sort by agentCount descending
    const result = Object.entries(tagCounts)
      .map(([name, agentCount]) => ({ name, agentCount }))
      .sort((a, b) => b.agentCount - a.agentCount);
    
    res.json(result);
  } catch (error) {
    console.error('[Skills] Error aggregating tags:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST '/suggest' → rank agents by skill matching
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { skills, includeAll = false, limit = 10 } = req.body;
    
    // Validate input
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({ message: 'skills array is required' });
    }
    
    // Normalize input skills
    const normalizedSkills = normalizeTags(skills);
    
    if (normalizedSkills.length === 0) {
      return res.status(400).json({ message: 'at least one valid skill is required' });
    }
    
    // Get all agents with their tags and active task counts
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        model: true,
        tags: true,
        activeTasks: true
      },
      orderBy: {
        activeTasks: 'asc' // For tiebreaking
      }
    });
    
    // Score each agent
    const scoredAgents = agents
      .map(agent => {
        // Normalize agent tags for comparison
        const normalizedAgentTags = normalizeTags(agent.tags);
        
        // Count matching skills (case-insensitive intersection)
        const matchedSkills = normalizedSkills.filter(skill =>
          normalizedAgentTags.includes(skill.toLowerCase())
        );
        
        const score = matchedSkills.length;
        
        // Exclude score-0 agents unless includeAll is true
        if (score === 0 && !includeAll) {
          return null;
        }
        
        return {
          agentId: agent.id,
          name: agent.name,
          model: agent.model,
          score,
          matchedSkills, // Original case from input skills
          activeTasks: agent.activeTasks
        };
      })
      .filter((agent): agent is NonNullable<typeof agent> => agent !== null)
      // Sort by score descending, then activeTasks ascending, then name ascending
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.activeTasks !== b.activeTasks) return a.activeTasks - b.activeTasks;
        return a.name.localeCompare(b.name);
      })
      // Apply limit
      .slice(0, limit);
    
    res.json(scoredAgents);
  } catch (error) {
    console.error('[Skills] Error in suggest endpoint:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;