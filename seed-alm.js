const API = 'http://127.0.0.1:3001/api';
const KEY = process.env.AGENT_API_KEY || 'MISSING-AGENT-API-KEY';

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': KEY.replace('X-Agent-Key: ', '') },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function seed() {
  const PID = 'pL8ZIF7gJssSQgQgYcjN';
  
  const agents = [
    { name: 'CTO Agent', agentId: 'agent:cto', role: 'Chief Technology Officer', capabilities: ['architecture','code-review','deployment','task-management'], projectId: PID },
    { name: 'Senior Developer', agentId: 'agent:seniordev', role: 'Senior Backend Developer', capabilities: ['backend','api','database','architecture'], projectId: PID },
    { name: 'Developer', agentId: 'agent:dev', role: 'Full-Stack Developer', capabilities: ['backend','frontend','api','testing'], projectId: PID },
    { name: 'UI Developer', agentId: 'agent:uidev', role: 'Frontend Developer', capabilities: ['react','css','ui-components','tailwind'], projectId: PID },
    { name: 'UI Expert', agentId: 'agent:uiexpert', role: 'UI/UX Expert', capabilities: ['design','accessibility','responsive','animation'], projectId: PID },
    { name: 'QA Ops', agentId: 'agent:qaops', role: 'QA & DevOps Engineer', capabilities: ['testing','ci-cd','deployment','monitoring'], projectId: PID },
    { name: 'QA Analyst', agentId: 'agent:qaanalyst', role: 'QA Test Analyst', capabilities: ['test-planning','manual-testing','regression','reporting'], projectId: PID },
    { name: 'SW Architect', agentId: 'agent:swarchi', role: 'Software Architect', capabilities: ['architecture','design-patterns','code-review','documentation'], projectId: PID },
    { name: 'PM Agent', agentId: 'agent:pm', role: 'Project Manager', capabilities: ['planning','coordination','reporting','risk-management'], projectId: PID },
    { name: 'Assistant', agentId: 'agent:assistant', role: 'General Assistant', capabilities: ['research','documentation','communication'], projectId: PID },
  ];

  for (const agent of agents) {
    const res = await post('/agents', agent);
    console.log('Agent:', res.name, '|', res.agentId);
  }

  console.log('\nSeeding complete!');
  console.log('Project:', PID);
  console.log('Agents:', agents.length);
}

seed().catch(console.error);