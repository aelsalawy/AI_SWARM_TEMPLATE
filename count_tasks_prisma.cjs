require('dotenv').config({ path: './.env' });
const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

(async () => {
  const total = await prisma.task.count();
  const done = await prisma.task.count({ where: { status: 'DONE' } });
  const open = total - done;
  console.log('=== Overall Summary ===');
  console.log(`Total tasks: ${total}`);
  console.log(`Done tasks: ${done}`);
  console.log(`Open tasks: ${open}`);

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log('\n=== Per‑Project Breakdown ===');
  for (const p of projects) {
    const projTotal = await prisma.task.count({ where: { projectId: p.id } });
    const projDone = await prisma.task.count({ where: { projectId: p.id, status: 'DONE' } });
    const projOpen = projTotal - projDone;
    console.log(`Project ${p.id} (${p.name}): Total=${projTotal}, Done=${projDone}, Open=${projOpen}`);
  }
  await prisma.$disconnect();
})();
