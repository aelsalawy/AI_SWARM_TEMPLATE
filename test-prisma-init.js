import { createPrismaClient } from './server/prisma.js';

async function testPrismaInit() {
  try {
    console.log('Testing Prisma client initialization...');
    const client = await createPrismaClient();
    console.log('Prisma client:', client);
    console.log('Client type:', typeof client);
    console.log('Client is null:', client === null);
    
    if (client) {
      console.log('Client has requirement:', !!client.requirement);
      if (client.requirement) {
        console.log('Requirement create function:', client.requirement.create.toString().substring(0, 100));
      }
    }
  } catch (error) {
    console.error('Error initializing Prisma:', error);
  }
}

testPrismaInit();