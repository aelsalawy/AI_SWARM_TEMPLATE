import { db, firebaseReady } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Define the 16 agents to seed
const agents = [
  {
    id: 'agent:cto',
    name: 'Newey',
    emoji: '🏗️',
    role: 'CTO',
    model: 'zai/glm-5.1',
    provider: 'zai',
    status: 'active',
    workspace: 'cto',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:assistant',
    name: 'Sweeney',
    emoji: '📊',
    role: 'Assistant',
    model: 'google/gemini-2.5-flash',
    provider: 'google',
    status: 'active',
    workspace: 'assistant',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:swarch',
    name: 'Khaled',
    emoji: '📐',
    role: 'SW Arch',
    model: 'zai/glm-4.5-flash',
    provider: 'zai',
    status: 'active',
    workspace: 'swarch',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:seniordev',
    name: 'Senior Dev',
    emoji: '🔧',
    role: 'Senior Developer',
    model: 'openrouter/nemotron-3-super-120b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'seniordev',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:dev',
    name: 'Dev',
    emoji: '💻',
    role: 'Developer',
    model: 'zai/glm-4.7-flash',
    provider: 'zai',
    status: 'active',
    workspace: 'dev',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:uiux',
    name: 'UI/UX Expert',
    emoji: '🎨',
    role: 'UI/UX Expert',
    model: 'openrouter/nemotron-3-super-120b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'uiux',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:uidev',
    name: 'UI Developer',
    emoji: '🖥️',
    role: 'UI Developer',
    model: 'zai/glm-4.7-flash',
    provider: 'zai',
    status: 'active',
    workspace: 'uidev',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:pm',
    name: 'PM Agent',
    emoji: '📋',
    role: 'Project Manager',
    model: 'openrouter/minimax/minimax-m2.5:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'pm',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:qaops',
    name: 'QA-Ops',
    emoji: '🧪',
    role: 'QA Operations',
    model: 'openrouter/openai/gpt-oss-120b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'qaops',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:qaanalyst',
    name: 'QA Analyst',
    emoji: '🔍',
    role: 'QA Analyst',
    model: 'openrouter/poolside/laguna-m.1:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'qaanalyst',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:security',
    name: 'Security',
    emoji: '🔒',
    role: 'Security Engineer',
    model: 'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'security',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:deployops',
    name: 'Deploy-Ops',
    emoji: '🚀',
    role: 'Deployment Operations',
    model: 'openrouter/openai/gpt-oss-20b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'deployops',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:devops',
    name: 'DevOps',
    emoji: '⚙️',
    role: 'DevOps Engineer',
    model: 'openrouter/z-ai/glm-4.5-air:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'devops',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:cfo',
    name: 'CFO',
    emoji: '💰',
    role: 'Chief Financial Officer',
    model: 'google/gemini-2.5-flash',
    provider: 'google',
    status: 'active',
    workspace: 'cfo',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:docs',
    name: 'Docs Agent',
    emoji: '📝',
    role: 'Documentation Specialist',
    model: 'openrouter/qwen/qwen3-next-80b-a3b-instruct:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'docs',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  },
  {
    id: 'agent:uxdev',
    name: 'UX Dev',
    emoji: '⚡',
    role: 'UX Developer',
    model: 'openrouter/nousresearch/hermes-3-llama-3.1-405b:free',
    provider: 'openrouter',
    status: 'active',
    workspace: 'uxdev',
    completedTaskCount: 0,
    currentTaskId: null,
    lastHeartbeat: Timestamp.now()
  }
];

async function seedAgents() {
  if (!firebaseReady || !db) {
    console.error('❌ Firebase not connected. Cannot seed agents.');
    console.error('   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in server/.env');
    process.exit(1);
  }
  try {
    console.log('Starting agent seeding...');
    
    // Clear existing agents collection (optional - uncomment if you want to clear first)
    // const agentsCollection = db.collection('agents');
    // const snapshot = await agentsCollection.get();
    // if (!snapshot.empty) {
    //   const batch = db.batch();
    //   snapshot.docs.forEach(doc => batch.delete(doc.ref));
    //   await batch.commit();
    //   console.log('Cleared existing agents');
    // }
    
    // Add each agent to Firestore
    for (const agent of agents) {
      const agentRef = db.collection('agents').doc(agent.id);
      await agentRef.set(agent);
      console.log(`Seeded agent: ${agent.name} (${agent.id})`);
    }
    
    console.log(`Successfully seeded ${agents.length} agents!`);
  } catch (error) {
    console.error('Error seeding agents:', error);
    process.exit(1);
  }
}

// Run the seeding function
seedAgents().then(() => {
  process.exit(0);
});