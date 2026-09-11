import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log('__dirname:', __dirname);

// Try different path combinations
const paths = [
  join(__dirname, 'generated', 'prisma', '.prisma', 'client'),
  join(__dirname, '..', 'generated', 'prisma', '.prisma', 'client'),
  join(__dirname, '..', '..', 'generated', 'prisma', '.prisma', 'client'),
  join(__dirname, '../..', 'generated', 'prisma', '.prisma', 'client'),
];

paths.forEach((path, index) => {
  console.log(`Path ${index}:`, path);
});

import { existsSync } from 'fs';
paths.forEach((path, index) => {
  console.log(`Path ${index} exists:`, existsSync(path));
});