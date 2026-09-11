import { prisma } from './server/prisma.js';

async function testPrismaDetection() {
  try {
    console.log('Testing Prisma detection...');
    
    // Check if prisma is a no-op proxy
    const isNoop = !prisma || !prisma.requirement;
    console.log('Is no-op proxy (basic check):', isNoop);
    
    if (!isNoop) {
      // Check the create function
      const createFunc = prisma.requirement.create.toString();
      console.log('Create function contains "const method=String(prop)":', createFunc.includes('const method=String(prop)'));
      console.log('Create function contains "Database unavailable":', createFunc.includes('Database unavailable'));
      console.log('Create function contains "Prisma not initialized":', createFunc.includes('Prisma not initialized'));
      console.log('Create function preview:', createFunc.substring(0, 200));
    }
    
    // Try to use the Prisma client
    try {
      const requirements = await prisma.requirement.findMany();
      console.log('Find many successful, count:', requirements.length);
    } catch (error) {
      console.error('Find many failed:', error.message);
    }
    
    // Try to create a requirement
    try {
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
      console.log('Create successful:', created.id);
    } catch (error) {
      console.error('Create failed:', error.message);
    }
  } catch (error) {
    console.error('Error testing Prisma detection:', error);
  }
}

testPrismaDetection();