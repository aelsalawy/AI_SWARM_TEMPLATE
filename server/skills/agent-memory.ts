/**
 * P2-Swarm-06: Per-Agent Persistent Memory — Project & Role Learnings
 *
 * Stores per-agent learnings, preferences, and context in Firestore.
 * Agents can store and retrieve their accumulated knowledge across sessions.
 */

import { db, firebaseReady } from '../firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentMemory {
  id?: string;
  agentId: string;
  category: 'learning' | 'preference' | 'context' | 'error_pattern' | 'project_knowledge';
  key: string;
  value: string;
  tags: string[];
  projectId?: string;
  createdAt: any;
  updatedAt: any;
  accessCount: number;
  lastAccessedAt?: any;
}

export interface AgentMemorySummary {
  agentId: string;
  totalMemories: number;
  categories: Record<string, number>;
  recentLearnings: AgentMemory[];
  topPreferences: AgentMemory[];
  projectKnowledge: AgentMemory[];
}

// ---------------------------------------------------------------------------
// Memory CRUD
// ---------------------------------------------------------------------------

/**
 * Store a memory for an agent
 */
export async function storeMemory(
  agentId: string,
  category: AgentMemory['category'],
  key: string,
  value: string,
  tags: string[] = [],
  projectId?: string
): Promise<AgentMemory | null> {
  if (!firebaseReady || !db) return null;

  try {
    // Check if memory with same agent/key/category exists
    const existing = await db.collection('agent_memory')
      .where('agentId', '==', agentId)
      .where('key', '==', key)
      .where('category', '==', category)
      .limit(1)
      .get();

    if (!existing.empty) {
      // Update existing
      const docRef = existing.docs[0].ref;
      await docRef.update({
        value,
        tags,
        projectId: projectId || null,
        updatedAt: Timestamp.now(),
      });

      console.log(`[AgentMemory] Updated: ${agentId}/${category}/${key}`);
      return { id: docRef.id, agentId, category, key, value, tags, projectId, createdAt: existing.docs[0].data().createdAt, updatedAt: Timestamp.now(), accessCount: existing.docs[0].data().accessCount || 0 };
    }

    // Create new
    const memory: Omit<AgentMemory, 'id'> = {
      agentId,
      category,
      key,
      value,
      tags,
      projectId: projectId || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      accessCount: 0,
    };

    const docRef = await db.collection('agent_memory').add(memory);
    console.log(`[AgentMemory] Stored: ${agentId}/${category}/${key}`);
    return { id: docRef.id, ...memory };
  } catch (error) {
    console.error('[AgentMemory] Error storing memory:', error);
    return null;
  }
}

/**
 * Retrieve a specific memory
 */
export async function getMemory(
  agentId: string,
  category: string,
  key: string
): Promise<AgentMemory | null> {
  if (!firebaseReady || !db) return null;

  try {
    const snapshot = await db.collection('agent_memory')
      .where('agentId', '==', agentId)
      .where('category', '==', category)
      .where('key', '==', key)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    // Increment access count
    const doc = snapshot.docs[0];
    await doc.ref.update({
      accessCount: ((doc.data().accessCount || 0) as number) + 1,
      lastAccessedAt: Timestamp.now(),
    });

    return { id: doc.id, ...doc.data() } as AgentMemory;
  } catch (error) {
    console.error('[AgentMemory] Error getting memory:', error);
    return null;
  }
}

/**
 * Retrieve all memories for an agent, optionally filtered
 */
export async function getAgentMemories(
  agentId: string,
  options?: {
    category?: string;
    projectId?: string;
    tags?: string[];
    limit?: number;
  }
): Promise<AgentMemory[]> {
  if (!firebaseReady || !db) return [];

  try {
    let query = db.collection('agent_memory')
      .where('agentId', '==', agentId);

    if (options?.category) {
      query = query.where('category', '==', options.category);
    }

    if (options?.projectId) {
      query = query.where('projectId', '==', options.projectId);
    }

    query = query.orderBy('updatedAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgentMemory));
  } catch (error) {
    console.error('[AgentMemory] Error getting memories:', error);
    return [];
  }
}

/**
 * Delete a specific memory
 */
export async function deleteMemory(memoryId: string): Promise<boolean> {
  if (!firebaseReady || !db) return false;

  try {
    await db.collection('agent_memory').doc(memoryId).delete();
    return true;
  } catch (error) {
    console.error('[AgentMemory] Error deleting memory:', error);
    return false;
  }
}

/**
 * Get a summary of an agent's memory
 */
export async function getMemorySummary(agentId: string): Promise<AgentMemorySummary> {
  const empty: AgentMemorySummary = {
    agentId,
    totalMemories: 0,
    categories: {},
    recentLearnings: [],
    topPreferences: [],
    projectKnowledge: [],
  };

  if (!firebaseReady || !db) return empty;

  try {
    const snapshot = await db.collection('agent_memory')
      .where('agentId', '==', agentId)
      .get();

    const memories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgentMemory));

    // Build categories count
    const categories: Record<string, number> = {};
    for (const mem of memories) {
      categories[mem.category] = (categories[mem.category] || 0) + 1;
    }

    // Get recent learnings
    const recentLearnings = memories
      .filter(m => m.category === 'learning')
      .sort((a, b) => {
        const ta = a.updatedAt?._seconds || 0;
        const tb = b.updatedAt?._seconds || 0;
        return tb - ta;
      })
      .slice(0, 10);

    // Get top preferences (by access count)
    const topPreferences = memories
      .filter(m => m.category === 'preference')
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
      .slice(0, 10);

    // Get project knowledge
    const projectKnowledge = memories
      .filter(m => m.category === 'project_knowledge')
      .slice(0, 10);

    return {
      agentId,
      totalMemories: memories.length,
      categories,
      recentLearnings,
      topPreferences,
      projectKnowledge,
    };
  } catch (error) {
    console.error('[AgentMemory] Error getting summary:', error);
    return empty;
  }
}

/**
 * Format agent memories as injectable context string
 */
export function formatMemoriesForContext(memories: AgentMemory[]): string {
  if (memories.length === 0) return '';

  const lines: string[] = ['## Agent Memory (Past Learnings)'];

  const byCategory = new Map<string, AgentMemory[]>();
  for (const mem of memories) {
    const list = byCategory.get(mem.category) || [];
    list.push(mem);
    byCategory.set(mem.category, list);
  }

  const categoryLabels: Record<string, string> = {
    learning: '📚 Learnings',
    preference: '⚙️ Preferences',
    context: '📋 Context',
    error_pattern: '⚠️ Error Patterns',
    project_knowledge: '🏗️ Project Knowledge',
  };

  for (const [cat, mems] of byCategory) {
    lines.push(`\n### ${categoryLabels[cat] || cat}`);
    for (const mem of mems) {
      lines.push(`- **${mem.key}**: ${mem.value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Batch store multiple memories (e.g., after task completion)
 */
export async function batchStoreMemories(
  agentId: string,
  memories: Array<{
    category: AgentMemory['category'];
    key: string;
    value: string;
    tags?: string[];
    projectId?: string;
  }>
): Promise<number> {
  let stored = 0;
  for (const mem of memories) {
    const result = await storeMemory(agentId, mem.category, mem.key, mem.value, mem.tags, mem.projectId);
    if (result) stored++;
  }
  return stored;
}
