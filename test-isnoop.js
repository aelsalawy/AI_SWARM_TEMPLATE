import { prisma } from './server/prisma.js';

function isNoopProxy(client) {
  if (!client || !client.requirement) return true;
  
  // Check if requirement.create is the no-op proxy function
  try {
    const createFunc = client.requirement.create.toString();
    // Check for both possible no-op proxy signatures
    return createFunc.includes('const method=String(prop)') || 
           createFunc.includes('Database unavailable') ||
           createFunc.includes('Prisma not initialized');
  } catch (e) {
    return true;
  }
}

console.log('Is no-op proxy:', isNoopProxy(prisma));
console.log('Create function contains "const method=String(prop)":', prisma.requirement.create.toString().includes('const method=String(prop)'));