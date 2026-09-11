import { prisma } from './prisma';
import { hashPassword } from './local-auth';

/**
 * Create a default admin user for the ALM system
 */
async function createDefaultUser() {
  try {
    const email = 'admin@swarmbuzz.online';
    const password = 'Admin123!'; // Change this after first login

    console.log('Checking if default user exists...');

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log('✓ Default user already exists:', email);
      console.log('  ID:', existingUser.id);
      console.log('  Role:', existingUser.role);
      return;
    }

    console.log('Creating default user...');

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'super_admin',
        permissions: ['all'],
      },
    });

    console.log('✓ Default user created successfully!');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  ID:', user.id);
    console.log('  Role:', user.role);
    console.log('');
    console.log('⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('✗ Failed to create default user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  createDefaultUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { createDefaultUser };