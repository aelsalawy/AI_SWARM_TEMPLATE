import { prisma } from './server/prisma.js';

async function testPrisma() {
  try {
    console.log('Testing Prisma client...');
    
    // Check if prisma is a no-op proxy
    const isNoop = !prisma || !prisma.requirement;
    console.log('Is no-op proxy:', isNoop);
    
    if (!isNoop) {
      // Try to create a requirement
      const testRequirement = {
        title: 'Test Requirement',
        description: 'Testing Prisma',
        status: 'Pending',
        ownerId: 'test-owner',
        projectId: 'test-project',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const created = await prisma.requirement.create({ data: testRequirement });
      console.log('Created requirement:', created);
      
      // Try to read requirements
      const requirements = await prisma.requirement.findMany();
      console.log('Found requirements:', requirements.length);
    } else {
      console.log('Prisma client is a no-op proxy');
    }
  } catch (error) {
    console.error('Error testing Prisma:', error);
  }
}

testPrisma();