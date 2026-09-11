import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as dotenv from 'dotenv';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env (works regardless of CWD)
dotenv.config({ path: resolve(__dirname, '.env') });

let firebaseApp;
let _db: Firestore | null = null;
let _firebaseReady = false;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Only initialize Firebase if we have all three required credentials
if (projectId && clientEmail && privateKey) {
  try {
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      firebaseApp = getApps()[0];
    }
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    _db = getFirestore(firebaseApp, databaseId);
    _firebaseReady = true;
    console.log('✅ Firebase Admin SDK initialized with service account');
  } catch (error) {
    console.warn('⚠️  Firebase Admin SDK failed to initialize:', error instanceof Error ? error.message : String(error));
    _db = null;
    _firebaseReady = false;
  }
} else {
  console.warn('⚠️  Firebase Admin SDK not configured — running in demo mode');
  console.warn('   Provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in server/.env');
  _db = null;
  _firebaseReady = false;
}

export const db = _db;
export const firebaseReady = _firebaseReady;
export default firebaseApp;

// Auth: verify Firebase ID token, skip in demo mode
export async function verifyFirebaseToken(req: import('express').Request): Promise<import('firebase-admin/auth').DecodedIdToken | null> {
  if (!_firebaseReady) return null; // demo mode — skip auth
  const auth = getAuth(firebaseApp!);
  const header = req.headers['authorization'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-firebase-token'] as string | undefined);
  if (!token) return null;
  try {
    return await auth.verifyIdToken(token);
  } catch {
    return null;
  }
}
