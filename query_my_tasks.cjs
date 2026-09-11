require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const myId = 'agent:uidev:subagent:1125577e-6cf5-49a1-aade-a5e0567c0a67';
  const byAgent = await prisma.task.findMany({
    where: { assignedAgentId: myId },
    select: { id: true, title: true, status: true, priority: true, epic: true, projectId: true, description: true }
  });
  console.log('=== Tasks assigned to my exact subagent ID ===');
  console.log(JSON.stringify(byAgent, null, 2));

  const byOwner = await prisma.task.findMany({
    where: { ownerId: myId },
    select: { id: true, title: true, status: true, priority: true, epic: true, projectId: true }
  });
  console.log('\n=== Tasks with ownerId = my subagent ID ===');
  console.log(JSON.stringify(byOwner, null, 2));

  const uidevOpen = await prisma.task.findMany({
    where: { assignedAgentId: 'agent:uidev', status: { not: 'DONE' } },
    select: { id: true, title: true, status: true, priority: true, epic: true, projectId: true }
  });
  console.log('\n=== Open tasks assigned to agent:uidev (parent) ===');
  console.log(JSON.stringify(uidevOpen, null, 2));

  await prisma.$disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
