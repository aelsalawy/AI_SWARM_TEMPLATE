const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: './.env' });

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.task.count();
  const done = await prisma.task.count({ where: { status: 'DONE' } });
  const open = total - done;
  console.log('=== Overall Summary ===');
  console.log(`Total tasks: ${total}`);
  console.log(`Done tasks: ${done}`);
  console.log(`Open tasks: ${open}`);

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log('\n=== Projects ===');
  console.log(`Projects count: ${projects.length}`);
  for (const p of projects) {
    const projTotal = await prisma.task.count({ where: { projectId: p.id } });
    const projDone = await prisma.task.count({ where: { projectId: p.id, status: 'DONE' } });
    const projOpen = projTotal - projDone;
    console.log(`- ${p.id} (${p.name}): Total=${projTotal}, Done=${projDone}, Open=${projOpen}`);
  }
}

main()
  .catch(e => { console.error('Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
