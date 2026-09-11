import { db, firebaseReady } from './firebase-admin';

/**
 * Seed skill/capability fields into all 16 agents in Firestore
 * Run: npx tsx server/seed-agent-skills.ts
 */

const AGENT_CAPABILITIES: Record<string, {
  skills: string[];
  maxConcurrentTasks: number;
  preferredTaskTypes: string[];
  specialties: string[];
}> = {
  'agent:cto': {
    skills: ['architecture', 'strategy', 'code-review', 'system-design'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['architecture', 'strategy', 'review'],
    specialties: ['emergency', 'escalation']
  },
  'agent:assistant': {
    skills: ['scheduling', 'communication', 'coordination', 'research'],
    maxConcurrentTasks: 5,
    preferredTaskTypes: ['coordination', 'research', 'communication'],
    specialties: ['scheduling', 'calendar']
  },
  'agent:swarch': {
    skills: ['architecture', 'design', 'documentation', 'code-review', 'system-design'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['architecture', 'review', 'design'],
    specialties: ['architecture', 'patterns']
  },
  'agent:seniordev': {
    skills: ['typescript', 'architecture', 'code-review', 'backend', 'refactoring'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['feature', 'refactor', 'backend'],
    specialties: ['complex-logic', 'performance']
  },
  'agent:dev': {
    skills: ['typescript', 'implementation', 'testing', 'frontend', 'backend'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['feature', 'bugfix', 'implementation'],
    specialties: ['implementation']
  },
  'agent:uiux': {
    skills: ['design', 'ux-research', 'wireframes', 'prototyping', 'accessibility'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['design', 'ux', 'research'],
    specialties: ['accessibility', 'user-research']
  },
  'agent:uidev': {
    skills: ['typescript', 'react', 'css', 'tailwind', 'frontend', 'responsive'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['frontend', 'ui', 'feature'],
    specialties: ['responsive', 'animation']
  },
  'agent:pm': {
    skills: ['planning', 'requirements', 'prioritization', 'sprint-management', 'documentation'],
    maxConcurrentTasks: 5,
    preferredTaskTypes: ['planning', 'requirements', 'documentation'],
    specialties: ['sprint-planning', 'backlog']
  },
  'agent:qaops': {
    skills: ['testing', 'automation', 'ci-cd', 'regression', 'performance-testing'],
    maxConcurrentTasks: 4,
    preferredTaskTypes: ['testing', 'verification', 'automation'],
    specialties: ['automation', 'ci-cd']
  },
  'agent:qaanalyst': {
    skills: ['testing', 'test-design', 'edge-cases', 'regression', 'manual-testing'],
    maxConcurrentTasks: 4,
    preferredTaskTypes: ['testing', 'verification', 'analysis'],
    specialties: ['edge-cases', 'regression']
  },
  'agent:security': {
    skills: ['security', 'penetration-testing', 'audit', 'compliance', 'encryption'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['security', 'audit', 'compliance'],
    specialties: ['vulnerability', 'compliance']
  },
  'agent:deployops': {
    skills: ['deployment', 'ci-cd', 'docker', 'kubernetes', 'monitoring'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['deployment', 'infrastructure', 'release'],
    specialties: ['deployment', 'rollback']
  },
  'agent:devops': {
    skills: ['infrastructure', 'ci-cd', 'docker', 'monitoring', 'automation'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['infrastructure', 'ci-cd', 'automation'],
    specialties: ['infrastructure', 'monitoring']
  },
  'agent:cfo': {
    skills: ['finance', 'budgeting', 'cost-analysis', 'forecasting', 'reporting'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['finance', 'analysis', 'reporting'],
    specialties: ['cost-optimization', 'budgeting']
  },
  'agent:docs': {
    skills: ['documentation', 'technical-writing', 'api-docs', 'markdown', 'diagrams'],
    maxConcurrentTasks: 5,
    preferredTaskTypes: ['documentation', 'api-docs', 'guides'],
    specialties: ['technical-writing', 'api-docs']
  },
  'agent:uxdev': {
    skills: ['typescript', 'react', 'css', 'animation', 'accessibility', 'frontend'],
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['frontend', 'ux', 'polish'],
    specialties: ['animation', 'interaction']
  }
};

async function seedAgentSkills() {
  if (!firebaseReady || !db) {
    console.error('Firebase not connected. Cannot seed skills.');
    process.exit(1);
  }

  console.log('Seeding agent capabilities into Firestore...');
  let updated = 0;

  for (const [agentId, caps] of Object.entries(AGENT_CAPABILITIES)) {
    try {
      const agentRef = db.collection('agents').doc(agentId);
      const agentDoc = await agentRef.get();

      if (!agentDoc.exists) {
        console.warn(`  ⚠️  Agent ${agentId} not found in Firestore, skipping`);
        continue;
      }

      await agentRef.update({
        skills: caps.skills,
        maxConcurrentTasks: caps.maxConcurrentTasks,
        preferredTaskTypes: caps.preferredTaskTypes,
        specialties: caps.specialties,
        workload: {
          activeTasks: 0,
          recentCompletionRate: 0,
          averageTaskDuration: 0
        }
      });

      console.log(`  ✅ ${agentId}: ${caps.skills.length} skills, max ${caps.maxConcurrentTasks} concurrent`);
      updated++;
    } catch (error) {
      console.error(`  ❌ ${agentId}: ${error}`);
    }
  }

  console.log(`\nDone: ${updated}/${Object.keys(AGENT_CAPABILITIES).length} agents updated`);
  process.exit(0);
}

seedAgentSkills().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
