import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedClientDir = join(__dirname, '..', 'generated', 'prisma', '.prisma', 'client');

console.log('__dirname:', __dirname);
console.log('Generated client dir:', generatedClientDir);

import { existsSync } from 'fs';
console.log('Generated client dir exists:', existsSync(generatedClientDir));
console.log('Index.js exists:', existsSync(join(generatedClientDir, 'index.js')));