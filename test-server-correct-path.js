import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Simulate the server directory
const serverDir = './server';

// Try different path combinations from server directory
const paths = [
  join(serverDir, 'generated', 'prisma', '.prisma', 'client'),
  join(serverDir, '..', 'generated', 'prisma', '.prisma', 'client'),
  join(serverDir, '../..', 'generated', 'prisma', '.prisma', 'client'),
];

paths.forEach((path, index) => {
  console.log(`Path ${index}:`, path);
});

import { existsSync } from 'fs';
paths.forEach((path, index) => {
  console.log(`Path ${index} exists:`, existsSync(path));
});